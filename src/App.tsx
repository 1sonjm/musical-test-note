import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Music, CheckCircle2, XCircle, RefreshCw, Settings2, AlertCircle, X, Volume2, VolumeX, MousePointerClick } from 'lucide-react';

type NoteDef = {
  vfKey: string;
  accidental: '' | '#' | 'b' | 'n';
  answerId: string;
};

// 개별 렌더링될 음표 인스턴스의 타입 정의
type NoteInstance = {
  id: number;
  def: NoteDef;
  x: number;
  color: string;
  duration: string;
};

// UI 렌더링용 상수
const WHITE_KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BLACK_KEYS = [
  { id: 'C#/Db', spacer: false },
  { id: 'D#/Eb', spacer: false },
  { id: '', spacer: true },
  { id: 'F#/Gb', spacer: false },
  { id: 'G#/Ab', spacer: false },
  { id: 'A#/Bb', spacer: false },
];

const SOLFEGE_MAP: Record<string, string> = {
  'C': '도', 'D': '레', 'E': '미', 'F': '파', 'G': '솔', 'A': '라', 'B': '시',
  'C#/Db': '도#/레b', 'D#/Eb': '레#/미b', 'F#/Gb': '파#/솔b', 'G#/Ab': '솔#/라b', 'A#/Bb': '라#/시b'
};

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 240;
const START_X = 380;
const END_X = 60;
const STAVE_Y = 70;
const NOTE_SPACING = 110;

// 전체 생성 가능 음계 배열 (C2 ~ B6)
const ALL_NOTES = Array.from({ length: 5 }, (_, i) => i + 2).flatMap(oct =>
  WHITE_KEYS.map(n => ({
    id: `${n}${oct}`,
    baseNote: n.toLowerCase(),
    octave: oct,
    display: `${n}${oct}`
  }))
);

// 조표에 따른 샵/플랫 매핑 데이터
const FLAT_KEYS = ['F', 'Bb', 'Eb', 'Ab'];
const KEY_SIG_ALTERS: Record<string, Record<string, string>> = {
  'C': {},
  'G': { 'F': '#' },
  'D': { 'F': '#', 'C': '#' },
  'A': { 'F': '#', 'C': '#', 'G': '#' },
  'E': { 'F': '#', 'C': '#', 'G': '#', 'D': '#' },
  'B': { 'F': '#', 'C': '#', 'G': '#', 'D': '#', 'A': '#' },
  'F': { 'B': 'b' },
  'Bb': { 'B': 'b', 'E': 'b' },
  'Eb': { 'B': 'b', 'E': 'b', 'A': 'b' },
  'Ab': { 'B': 'b', 'E': 'b', 'A': 'b', 'D': 'b' },
};

// 정답 규격화 함수
const getStandardAnswerId = (pitch: string): string => {
  if (['C', 'D', 'E', 'F', 'G', 'A', 'B'].includes(pitch)) return pitch;
  const map: Record<string, string> = {
    'C#': 'C#/Db', 'Db': 'C#/Db',
    'D#': 'D#/Eb', 'Eb': 'D#/Eb',
    'F#': 'F#/Gb', 'Gb': 'F#/Gb',
    'G#': 'G#/Ab', 'Ab': 'G#/Ab',
    'A#': 'A#/Bb', 'Bb': 'A#/Bb',
  };
  return map[pitch] || pitch;
};

// 동적 음표 풀 생성 함수 (조표 기반 임시표 계산 적용)
const buildNotePool = (startIndex: number, endIndex: number, useAcc: boolean, keySig: string): NoteDef[] => {
  const pool: NoteDef[] = [];
  const alters = KEY_SIG_ALTERS[keySig] || {};
  const isFlatKey = FLAT_KEYS.includes(keySig);

  for (let i = startIndex; i <= endIndex; i++) {
    const noteInfo = ALL_NOTES[i];
    const baseUpper = noteInfo.baseNote.toUpperCase();
    const keyAccidental = alters[baseUpper]; // '#' or 'b' or undefined

    // 1. 조표가 반영된 기본(Diatonic) 음표
    let diatonicPitch = baseUpper;
    if (keyAccidental) diatonicPitch += keyAccidental;

    pool.push({
      vfKey: `${noteInfo.baseNote}/${noteInfo.octave}`,
      accidental: '', // 조표에 의해 자동 적용되므로 VexFlow 상의 임시표 표기는 없음
      answerId: getStandardAnswerId(diatonicPitch)
    });

    // 2. 임시표(Accidental) 옵션 활성화 시 조표에 반하는 음표 추가
    if (useAcc) {
      if (keyAccidental) {
        // 조표에 의해 #/b이 붙는 음표 -> 제자리표(n) 처리 파생
        pool.push({
          vfKey: `${noteInfo.baseNote}/${noteInfo.octave}`,
          accidental: 'n',
          answerId: baseUpper
        });
      } else {
        // 조표에 영향을 받지 않는 음표 -> 조표의 계열(Sharp/Flat)에 따라 #/b 추가 파생
        if (isFlatKey) {
          // Cb(B), Fb(E) 와 같은 이명동음 혼란을 막기 위해 자주 쓰이는 음계만 추가
          if (['D', 'E', 'G', 'A', 'B'].includes(baseUpper)) {
            pool.push({
              vfKey: `${noteInfo.baseNote}/${noteInfo.octave}`,
              accidental: 'b',
              answerId: getStandardAnswerId(baseUpper + 'b')
            });
          }
        } else {
          // E#(F), B#(C) 등 방지
          if (['C', 'D', 'F', 'G', 'A'].includes(baseUpper)) {
            pool.push({
              vfKey: `${noteInfo.baseNote}/${noteInfo.octave}`,
              accidental: '#',
              answerId: getStandardAnswerId(baseUpper + '#')
            });
          }
        }
      }
    }
  }
  return pool;
};

// 로컬 스토리지 관리를 위한 커스텀 훅
function useLocalStorage<T>({ key, defaultValue }: { key: string, defaultValue: T }): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error(`[useLocalStorage] init error (${key}):`, error)
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error(`[useLocalStorage] update error (${key}):`, error);
    }
  }, [key, state]);

  return [state, setState];
}

// 메인 게임 컴포넌트
export default function App() {
  const [uiScore, setUiScore] = useState(0);
  const [uiStreak, setUiStreak] = useState(0);
  const [feedback, setFeedback] = useState<{ status: 'idle' | 'correct' | 'incorrect' | 'missed', message: string }>({ status: 'idle', message: '' });
  const [isVexLoaded, setIsVexLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  const [currentBeat, setCurrentBeat] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  
  // 싱크 조정을 위한 탭 타이밍 상태
  const tapDeltasRef = useRef<number[]>([]);
  const lastVisualBeatTimeRef = useRef<number>(0);
  const [syncMessage, setSyncMessage] = useState<string>('');
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 초기 시간 설정
  useEffect(() => {
    lastVisualBeatTimeRef.current = Date.now();
  }, []);

  const [bpm, setBpm] = useLocalStorage<number>({ key: 'music-app-bpm', defaultValue: 60 });
  const [syncOffset, setSyncOffset] = useLocalStorage<number>({ key: 'music-app-sync-offset', defaultValue: 0 }); // 양수: 오디오 지연, 음수: 시각 지연
  const [useAccidentals, setUseAccidentals] = useLocalStorage<boolean>({ key: 'music-app-accidentals', defaultValue: false });
  const [randomBeats, setRandomBeats] = useLocalStorage<boolean>({ key: 'music-app-beats', defaultValue: false });
  const [displayMode, setDisplayMode] = useLocalStorage<'alphabet' | 'solfege'>({ key: 'music-app-display-mode', defaultValue: 'alphabet' });
  const [clef, setClef] = useLocalStorage<'treble' | 'bass'>({ key: 'music-app-clef', defaultValue: 'treble' });
  const [keySignature, setKeySignature] = useLocalStorage<string>({ key: 'music-app-keysig', defaultValue: 'C' });
  const [range, setRange] = useLocalStorage<[number, number]>({ key: 'music-app-range', defaultValue: [14, 28] }); 
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const notesRef = useRef<NoteInstance[]>([]);
  const noteIdCounter = useRef(0);
  const feedbackTimer = useRef<NodeJS.Timeout | null>(null);
  
  const calculatedSpeed = useMemo(() => (NOTE_SPACING * bpm) / 3600, [bpm]);
  const speedRef = useRef(calculatedSpeed);
  useEffect(() => { speedRef.current = calculatedSpeed; }, [calculatedSpeed]);

  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  
  const syncOffsetRef = useRef(syncOffset);
  useEffect(() => { syncOffsetRef.current = syncOffset; }, [syncOffset]);

  const activeNotePool = useMemo(() => buildNotePool(range[0], range[1], useAccidentals, keySignature), [range, useAccidentals, keySignature]);

  // 싱크 조정을 위한 탭 템포 처리
  const handleSyncTap = useCallback(() => {
    const now = Date.now();
    const beatInterval = 60000 / bpm;
    const timeSinceLastVisual = now - lastVisualBeatTimeRef.current;

    let delta = timeSinceLastVisual;
    if (delta > beatInterval / 2) {
      delta -= beatInterval; 
    }

    tapDeltasRef.current.push(delta);

    if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);

    setSyncMessage('싱크 중...');

    tapTimeoutRef.current = setTimeout(() => {
      const deltas = tapDeltasRef.current;
      if (deltas.length > 0) {
        const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        setSyncOffset(prev => {
          const newOffset = Math.round(prev + avgDelta);
          return Math.max(-500, Math.min(500, newOffset));
        });
        setSyncMessage(`싱크 완료: ${syncOffset}ms`);
      } else {
        setSyncMessage('');
      }
      tapDeltasRef.current = [];
      setTimeout(() => setSyncMessage(''), 2000);
    }, 5000);
  }, [bpm, setSyncOffset, syncOffset]);

  const playBeatSound = useCallback((isAccent: boolean) => {
    if (!audioCtxRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = isAccent ? 1200 : 800; 
    osc.type = 'sine';

    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  }, []);

  // 메트로놈 루프 (오프셋 기반 시각/청각 지연 처리)
  useEffect(() => {
    const beatInterval = 60000 / bpm;
    let beatCounter = 0;

    const intervalId = setInterval(() => {
      const currentCount = beatCounter++;
      const visualBeat = currentCount % 4;
      const audioBeat = currentCount % 4;
      const offset = syncOffsetRef.current;

      if (offset >= 0) {
        // 시각 효과 우선, 오디오 지연
        setCurrentBeat(visualBeat);
        lastVisualBeatTimeRef.current = Date.now();
        if (soundEnabledRef.current) {
          setTimeout(() => playBeatSound(audioBeat === 3), offset);
        }
      } else {
        // 오디오 우선, 시각 효과 지연
        if (soundEnabledRef.current) {
          playBeatSound(audioBeat === 3);
        }
        setTimeout(() => {
          setCurrentBeat(visualBeat);
          lastVisualBeatTimeRef.current = Date.now();
        }, -offset);
      }
    }, beatInterval);

    return () => clearInterval(intervalId);
  }, [bpm, playBeatSound]);

  useEffect(() => {
    queueMicrotask(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).Vex) { setIsVexLoaded(true); return; }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/vexflow/3.0.9/vexflow-min.js';
      script.async = true;
      script.onload = () => setIsVexLoaded(true);
      document.body.appendChild(script);
    });
  }, []);

  const spawnNote = useCallback((startX = START_X) => {
    if (activeNotePool.length === 0) return;
    const randomIndex = Math.floor(Math.random() * activeNotePool.length);
    const durations = ['w', 'h', 'q', '8'];
    const selectedDuration = randomBeats ? durations[Math.floor(Math.random() * durations.length)] : 'q';

    notesRef.current.push({
      id: noteIdCounter.current++,
      def: activeNotePool[randomIndex],
      x: startX,
      color: '#1e293b',
      duration: selectedDuration
    });
  }, [activeNotePool, randomBeats]);

  const triggerFeedback = useCallback((status: 'correct' | 'incorrect' | 'missed', message: string) => {
    setFeedback({ status, message });
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback({ status: 'idle', message: '' }), 350);
  }, []);

  const resetGame = useCallback(() => {
    setUiScore(0);
    setUiStreak(0);
    notesRef.current = [];
    spawnNote(START_X);
  }, [spawnNote]);

  useEffect(() => { queueMicrotask(resetGame); }, [range, useAccidentals, clef, keySignature, randomBeats, resetGame]);

  useEffect(() => {
    if (!isVexLoaded || !canvasRef.current || activeNotePool.length === 0) return;
    if (notesRef.current.length === 0) queueMicrotask(() => spawnNote(START_X));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const VF = (window as any).Vex.Flow;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const renderer = new VF.Renderer(canvas, VF.Renderer.Backends.CANVAS);
    renderer.resize(CANVAS_WIDTH, CANVAS_HEIGHT);
    const context = renderer.getContext();
    context.setFont('Arial', 10);

    let animationFrameId: number;

    const renderLoop = () => {
      notesRef.current.forEach(n => n.x -= speedRef.current);

      if (notesRef.current.length > 0 && notesRef.current[0].x <= END_X) {
        const missedNote = notesRef.current.shift();
        if (missedNote) {
          const ans = missedNote.def.answerId;
          triggerFeedback('missed', `${ans} (${SOLFEGE_MAP[ans]})`);
        }
        setUiStreak(0);
      }

      const lastNote = notesRef.current[notesRef.current.length - 1];
      if (!lastNote || lastNote.x <= START_X - NOTE_SPACING) {
        spawnNote(START_X);
      }

      if (ctx) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(END_X, 20);
        ctx.lineTo(END_X, CANVAS_HEIGHT - 20);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      const stave = new VF.Stave(10, STAVE_Y, CANVAS_WIDTH - 20);
      stave.addClef(clef);
      stave.addKeySignature(keySignature);
      stave.setContext(context).draw();

      notesRef.current.forEach((noteInst, index) => {
        try {
          const note = new VF.StaveNote({ keys: [noteInst.def.vfKey], duration: noteInst.duration, clef: clef });
          if (noteInst.def.accidental !== '') note.addModifier(new VF.Accidental(noteInst.def.accidental), 0);
          
          const isTarget = index === 0;
          const drawColor = isTarget ? noteInst.color : '#787b7e'; 
          note.setStyle({ fillStyle: drawColor, strokeStyle: drawColor });
          
          const tc = new VF.TickContext();
          tc.setX(noteInst.x);
          note.setTickContext(tc);
          note.setStave(stave);
          note.setContext(context).draw();
        } catch(e) {
          console.error('Error rendering note:', e);
        }
      });

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    renderLoop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isVexLoaded, activeNotePool, clef, keySignature, spawnNote, triggerFeedback]);

  const handleGuess = (guessedId: string) => {
    if (notesRef.current.length === 0) return;

    const targetNote = notesRef.current[0];
    const ans = targetNote.def.answerId;
    const feedbackMessage = `${ans} (${SOLFEGE_MAP[ans]})`;

    if (guessedId === ans) {
      triggerFeedback('correct', feedbackMessage);
      setUiScore(prev => prev + 10);
      setUiStreak(prev => prev + 1);
      notesRef.current.shift(); 
    } else {
      triggerFeedback('incorrect', feedbackMessage);
      setUiStreak(0);
      targetNote.color = "#ef4444"; 
    }
  };

  const MIN = 0;
  const MAX = ALL_NOTES.length - 1;
  const minPercent = ((range[0] - MIN) / (MAX - MIN)) * 100;
  const maxPercent = ((range[1] - MIN) / (MAX - MIN)) * 100;

  return (
    <div className="min-h-screen bg-slate-200 flex flex-col items-center justify-center p-4 font-sans text-slate-800 user-select-none">
      <div className="max-w-[440px] w-full bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col border border-slate-300 relative">
        
        {/* 상단 점수 및 타이틀 헤더 */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-1">
            <Music className="w-5 h-5 text-indigo-600" />
            <h1 className="text-lg font-bold text-slate-800 flex items-center whitespace-nowrap">
              Musical 
              <span className="font-[cursive] italic text-indigo-500 text-xl mx-1 translate-y-[-2px]">"TEST"</span> 
              Note
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm font-semibold text-slate-600">
            <div>점수: <span className="text-indigo-600 text-lg ml-0.5">{uiScore}</span></div>
            <div>연속: <span className="text-orange-500 text-lg ml-0.5">{uiStreak}</span></div>
          </div>
        </div>

        {/* 오선지 캔버스 영역 */}
        <div className="py-2 flex flex-col items-center justify-center relative flex-1 min-h-[260px] bg-white overflow-hidden">
          
          {/* 상단 기능 영역 */}
          <div className="absolute top-2 left-0 right-0 px-4 flex justify-between items-center z-10">
            <div className="flex items-center gap-2">
              <button onClick={resetGame} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
                <RefreshCw className="w-5 h-5" />
              </button>
              
              <div className="flex items-center">
                <button 
                  onClick={handleSyncTap}
                  className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-2 py-1 rounded-full text-xs font-bold border border-indigo-200 transition-colors mr-2"
                  title="박자에 맞춰 탭하여 싱크 조정"
                >
                  <MousePointerClick className="w-3.5 h-3.5" />
                  TAP
                </button>
                {syncMessage && <span className="text-xs text-indigo-500 font-medium w-16 whitespace-nowrap">{syncMessage}</span>}
              </div>
            </div>

            <div className="flex items-center gap-3 bg-slate-100 px-3 py-1.5 rounded-full shadow-inner border border-slate-200">
              <button 
                onClick={() => setSoundEnabled(!soundEnabled)} 
                className={`p-0.5 transition-colors ${soundEnabled ? 'text-indigo-600' : 'text-slate-400'}`}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <div className="flex gap-1.5">
                {[0, 1, 2, 3].map((beat) => (
                  <div 
                    key={beat} 
                    className={`w-2.5 h-2.5 rounded-full transition-colors duration-100 ${
                      currentBeat === beat 
                        ? (beat === 3 ? 'bg-indigo-600 shadow-[0_0_6px_rgba(79,70,229,0.6)]' : 'bg-indigo-400') 
                        : 'bg-slate-300'
                    }`} 
                  />
                ))}
              </div>
            </div>
            
            <button onClick={() => setShowSettings(true)} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors ml-2">
              <Settings2 className="w-6 h-6" />
            </button>
          </div>

          <canvas ref={canvasRef} className="block mt-4" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} />
          
          {!isVexLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-0">
              <span className="text-sm font-medium text-indigo-500 animate-pulse">악보 엔진 로딩 중...</span>
            </div>
          )}

          {/* 피드백 메시지 */}
          <div className="absolute bottom-2 h-6 flex items-center justify-center w-full pointer-events-none z-10">
            {feedback.status === 'correct' && <span className="text-green-500 text-base font-bold flex items-center gap-1"><CheckCircle2 className="w-5 h-5" /> {feedback.message}</span>}
            {feedback.status === 'incorrect' && <span className="text-red-500 text-base font-bold flex items-center gap-1"><XCircle className="w-5 h-5" /> {feedback.message}</span>}
            {feedback.status === 'missed' && <span className="text-orange-500 text-base font-bold flex items-center gap-1"><AlertCircle className="w-5 h-5" /> {feedback.message}</span>}
          </div>

          {/* 설정 팝오버 */}
          {showSettings && (
            <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-20 p-5 overflow-y-auto border-t border-slate-200">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-indigo-700 flex items-center gap-2">
                  <Settings2 className="w-5 h-5" /> 환경 설정
                </h2>
                <button onClick={() => setShowSettings(false)} className="p-1 text-slate-500 hover:text-slate-800 bg-slate-100 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <label className="text-sm font-semibold text-slate-700 block mb-1">메트로놈 속도: {bpm} BPM</label>
                  <input 
                    type="range" min="30" max="240" step="5" 
                    value={bpm} onChange={(e) => setBpm(Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                  <div className="flex justify-between items-center mt-3">
                    <span className="text-xs font-semibold text-slate-600">오디오 싱크 보정 (수동)</span>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" value={syncOffset} onChange={(e) => setSyncOffset(Number(e.target.value))}
                        className="w-16 border border-slate-300 rounded px-1.5 py-1 text-xs text-right"
                      />
                      <span className="text-xs text-slate-500">ms</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-600 block mb-1">음자리표</label>
                    <select 
                      value={clef} onChange={(e) => setClef(e.target.value as 'treble' | 'bass')}
                      className="w-full border border-slate-300 rounded p-1.5 text-sm bg-white"
                    >
                      <option value="treble">높은음 (Treble)</option>
                      <option value="bass">낮은음 (Bass)</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-600 block mb-1">조표 (Key)</label>
                    <select 
                      value={keySignature} onChange={(e) => setKeySignature(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1.5 text-sm bg-white"
                    >
                      <option value="C">C Major</option><option value="G">G Major (1#)</option>
                      <option value="D">D Major (2#)</option><option value="A">A Major (3#)</option>
                      <option value="E">E Major (4#)</option><option value="B">B Major (5#)</option>
                      <option value="F">F Major (1b)</option><option value="Bb">Bb Major (2b)</option>
                      <option value="Eb">Eb Major (3b)</option><option value="Ab">Ab Major (4b)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex justify-between items-center bg-white px-3 py-2 rounded border border-slate-200 cursor-pointer">
                    <span className="text-sm font-medium text-slate-700">임시표(#/b) 포함</span>
                    <input type="checkbox" checked={useAccidentals} onChange={(e) => setUseAccidentals(e.target.checked)} className="accent-indigo-600 w-4 h-4" />
                  </label>
                  <label className="flex justify-between items-center bg-white px-3 py-2 rounded border border-slate-200 cursor-pointer">
                    <span className="text-sm font-medium text-slate-700">다양한 박자 포함</span>
                    <input type="checkbox" checked={randomBeats} onChange={(e) => setRandomBeats(e.target.checked)} className="accent-indigo-600 w-4 h-4" />
                  </label>
                  <label className="flex justify-between items-center bg-white px-3 py-2 rounded border border-slate-200 cursor-pointer">
                    <span className="text-sm font-medium text-slate-700">계이름(도레미) 표기</span>
                    <input type="checkbox" checked={displayMode === 'solfege'} onChange={(e) => setDisplayMode(e.target.checked ? 'solfege' : 'alphabet')} className="accent-indigo-600 w-4 h-4" />
                  </label>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <span className="text-sm font-semibold text-slate-700 block mb-2">음역대 지정 범위</span>
                  <div className="relative pt-2 pb-2">
                    <div className="relative w-full h-2 bg-slate-200 rounded-full flex items-center">
                      <div className="absolute h-2 bg-indigo-500 rounded-full pointer-events-none" style={{ left: `${minPercent}%`, width: `${maxPercent - minPercent}%` }} />
                      <input 
                        type="range" min={MIN} max={MAX} value={range[0]}
                        onChange={(e) => setRange([Math.min(Number(e.target.value), range[1] - 1), range[1]])}
                        className="absolute w-full appearance-none bg-transparent pointer-events-none z-20 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-indigo-600 [&::-webkit-slider-thumb]:rounded-full"
                      />
                      <input 
                        type="range" min={MIN} max={MAX} value={range[1]}
                        onChange={(e) => setRange([range[0], Math.max(Number(e.target.value), range[0] + 1)])}
                        className="absolute w-full appearance-none bg-transparent pointer-events-none z-30 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-indigo-600 [&::-webkit-slider-thumb]:rounded-full"
                      />
                    </div>
                    <div className="flex justify-between items-center mt-3 text-xs font-bold text-indigo-700">
                      <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200">{ALL_NOTES[range[0]].display}</span>
                      <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200">{ALL_NOTES[range[1]].display}</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>

        {/* 건반 UI */}
        <div className="p-5 bg-slate-100 border-t border-slate-200 pb-8 z-0">
          <div className="flex flex-col gap-2 max-w-[360px] mx-auto">
            <div className="flex justify-center gap-2">
              {BLACK_KEYS.map((key, idx) => (
                key.spacer ? (
                  <div key={`spacer-${idx}`} className="w-[42px]"></div>
                ) : (
                  <button
                    key={key.id}
                    onClick={() => handleGuess(key.id)}
                    disabled={!isVexLoaded || !useAccidentals}
                    className={`
                      w-[42px] h-12 rounded text-xs font-bold transition-all duration-75
                      ${useAccidentals 
                        ? 'bg-slate-800 text-white hover:bg-slate-700 active:bg-slate-900 active:scale-95 shadow-md' 
                        : 'bg-slate-300 text-slate-400 cursor-not-allowed opacity-50'
                      }
                    `}
                  >
                    {(displayMode === 'solfege' ? SOLFEGE_MAP[key.id] : key.id).split('/')[0]}<br/>
                    <span className="text-[9px] font-normal">{(displayMode === 'solfege' ? SOLFEGE_MAP[key.id] : key.id).split('/')[1]}</span>
                  </button>
                )
              ))}
            </div>
            
            <div className="flex justify-center gap-2">
              {WHITE_KEYS.map((key) => (
                <button
                  key={key}
                  onClick={() => handleGuess(key)}
                  disabled={!isVexLoaded}
                  className="w-[42px] h-14 bg-white border border-slate-300 rounded shadow-sm text-indigo-700 text-lg font-bold hover:bg-indigo-50 hover:border-indigo-400 active:bg-slate-100 active:scale-95 transition-all duration-75"
                >
                  {displayMode === 'solfege' ? SOLFEGE_MAP[key] : key}
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}