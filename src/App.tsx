import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Music, CheckCircle2, XCircle, RefreshCw, Settings2, AlertCircle } from 'lucide-react';

type NoteDef = {
  vfKey: string;
  accidental: '' | '#' | 'b';
  answerId: string;
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

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 240; 
const START_X = 380;
const END_X = 60;
const STAVE_Y = 70;

// 전체 생성 가능 음계 배열 (C2 ~ B6)
const ALL_NOTES = Array.from({ length: 5 }, (_, i) => i + 2).flatMap(oct =>
  WHITE_KEYS.map(n => ({
    id: `${n}${oct}`,
    baseNote: n.toLowerCase(),
    octave: oct,
    display: `${n}${oct}`
  }))
);

// 동적 음표 풀 생성 함수
const buildNotePool = (startIndex: number, endIndex: number, useAcc: boolean): NoteDef[] => {
  const pool: NoteDef[] = [];
  
  for (let i = startIndex; i <= endIndex; i++) {
    const noteInfo = ALL_NOTES[i];
    const upper = noteInfo.baseNote.toUpperCase();
    
    // 기본 음표 추가
    pool.push({ vfKey: `${noteInfo.baseNote}/${noteInfo.octave}`, accidental: '', answerId: upper });
    
    // 임시표 사용 시 추가 파생
    if (useAcc) {
      if (upper !== 'E' && upper !== 'B') {
        const nextNoteInfo = ALL_NOTES[i + 1];
        if (nextNoteInfo) {
          const answerId = `${upper}#/${nextNoteInfo.baseNote.toUpperCase()}b`;
          pool.push({ vfKey: `${noteInfo.baseNote}/${noteInfo.octave}`, accidental: '#', answerId });
          pool.push({ vfKey: `${nextNoteInfo.baseNote}/${nextNoteInfo.octave}`, accidental: 'b', answerId });
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
      console.error('[useLocalStorage] init error:', error)
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error('[useLocalStorage] update error:', error)
    }
  }, [key, state]);

  return [state, setState];
}

// 메인 게임 컴포넌트
export default function App() {
  const [uiScore, setUiScore] = useState(0);
  const [uiStreak, setUiStreak] = useState(0);
  const [feedback, setFeedback] = useState<'idle' | 'correct' | 'incorrect' | 'missed'>('idle');
  const [isVexLoaded, setIsVexLoaded] = useState(false);
  
  // 로컬 스토리지 연동 상태
  const [speed, setSpeed] = useLocalStorage<number>({ key: 'music-app-speed', defaultValue: 1.5 });
  const [useAccidentals, setUseAccidentals] = useLocalStorage<boolean>({ key: 'music-app-accidentals', defaultValue: false });
  const [clef, setClef] = useLocalStorage<'treble' | 'bass'>({ key: 'music-app-clef', defaultValue: 'treble' });
  const [range, setRange] = useLocalStorage<[number, number]>({ key: 'music-app-range', defaultValue: [14, 28] }); 
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentNoteRef = useRef<NoteDef | null>(null);
  const noteXRef = useRef(START_X);
  const noteColorRef = useRef("black");
  const speedRef = useRef(speed);
  
  const activeNotePool = useMemo(() => 
    buildNotePool(range[0], range[1], useAccidentals),
  [range, useAccidentals]);

  useEffect(() => { speedRef.current = speed; }, [speed]);

  // VexFlow 동적 로드
  useEffect(() => {
    // 상태 업데이트를 마이크로태스크로 예약하여 동기적 렌더링 사이클을 방해하지 않도록 합니다.
    queueMicrotask(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).Vex) {
        setIsVexLoaded(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/vexflow/3.0.9/vexflow-min.js';
      script.async = true;
      script.onload = () => setIsVexLoaded(true);
      document.body.appendChild(script);
    });
  }, []);

  const generateRandomNote = useCallback(() => {
    if (activeNotePool.length === 0) return;
    const randomIndex = Math.floor(Math.random() * activeNotePool.length);
    currentNoteRef.current = activeNotePool[randomIndex];
    noteXRef.current = START_X;
    noteColorRef.current = "black";
    setFeedback('idle');
  }, [activeNotePool]);

  // 설정 변경 시 진행도 초기화
  useEffect(() => {
    // 상태 업데이트를 마이크로태스크로 예약하여 동기적 렌더링 사이클을 방해하지 않도록 합니다.
    queueMicrotask(() => {
      generateRandomNote();
      setUiScore(0);
      setUiStreak(0);
    });
  }, [range, useAccidentals, clef, generateRandomNote]);

  const resetGame = () => {
    setUiScore(0);
    setUiStreak(0);
    generateRandomNote();
  };

  // VexFlow 렌더링 루프
  useEffect(() => {
    if (!isVexLoaded || !canvasRef.current || activeNotePool.length === 0) return;
    
    if (!currentNoteRef.current || !activeNotePool.includes(currentNoteRef.current)) {
      // 상태 업데이트를 마이크로태스크로 예약합니다.
      queueMicrotask(() => {
        generateRandomNote();
      });
    }

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
      noteXRef.current -= speedRef.current;

      if (noteXRef.current <= END_X) {
        setFeedback('missed');
        setUiStreak(0);
        generateRandomNote();
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
      stave.setContext(context).draw();

      if (currentNoteRef.current) {
        try {
          const note = new VF.StaveNote({ 
            keys: [currentNoteRef.current.vfKey], 
            duration: 'q', 
            clef: clef 
          });
          
          if (currentNoteRef.current.accidental !== '') {
            note.addModifier(new VF.Accidental(currentNoteRef.current.accidental), 0);
          }
          
          note.setStyle({ fillStyle: noteColorRef.current, strokeStyle: noteColorRef.current });
          
          const tc = new VF.TickContext();
          tc.setX(noteXRef.current);
          note.setTickContext(tc);
          note.setStave(stave);
          note.setContext(context).draw();
        } catch(e) {
          console.error("음표 렌더링 에러:", e);
        }
      }

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    renderLoop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isVexLoaded, generateRandomNote, activeNotePool, clef]);

  const handleGuess = (guessedId: string) => {
    if (!currentNoteRef.current || feedback === 'correct') return;

    if (guessedId === currentNoteRef.current.answerId) {
      setFeedback('correct');
      setUiScore(prev => prev + 10);
      setUiStreak(prev => prev + 1);
      generateRandomNote();
    } else {
      setFeedback('incorrect');
      setUiStreak(0);
      noteColorRef.current = "#ef4444";
    }
  };

  // 커스텀 이중 슬라이더 렌더링 값 계산
  const MIN = 0;
  const MAX = ALL_NOTES.length - 1;
  const minPercent = ((range[0] - MIN) / (MAX - MIN)) * 100;
  const maxPercent = ((range[1] - MIN) / (MAX - MIN)) * 100;

  return (
    <div className="min-h-screen bg-slate-200 flex flex-col items-center justify-center p-4 font-sans text-slate-800">
      <div className="max-w-5xl w-full bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col md:flex-row border border-slate-300">
        
        {/* 좌측: 설정 패널 */}
        <div className="w-full md:w-80 bg-slate-50 border-r border-slate-200 p-6 flex flex-col gap-6">
          <div className="flex items-center gap-2 text-indigo-600 mb-2">
            <Settings2 className="w-6 h-6" />
            <h2 className="text-xl font-bold">게임 설정</h2>
          </div>

          <div className="space-y-6">
            {/* 속도 설정 */}
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-2">이동 속도: {speed.toFixed(1)}x</label>
              <input 
                type="range" min="0.5" max="4" step="0.1" 
                value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>

            {/* 음자리표 설정 */}
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-2">음자리표 (Clef)</label>
              <select 
                value={clef} 
                onChange={(e) => setClef(e.target.value as 'treble' | 'bass')}
                className="w-full border border-slate-300 rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="treble">높은음자리표 (Treble)</option>
                <option value="bass">낮은음자리표 (Bass)</option>
              </select>
            </div>

            {/* 샾/플랫 설정 */}
            <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
              <span className="text-sm font-semibold text-slate-700">임시표(#/b) 포함</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" className="sr-only peer"
                  checked={useAccidentals} onChange={(e) => setUseAccidentals(e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-2 peer-focus:ring-indigo-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {/* 이중 슬라이더 기반 음역대 설정 */}
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-4">
              <span className="text-sm font-semibold text-slate-700 block border-b pb-2 mb-2">음역대 지정 범위</span>
              
              <div className="relative pt-4 pb-2">
                <div className="relative w-full h-2 bg-slate-200 rounded-full flex items-center">
                  <div 
                    className="absolute h-2 bg-indigo-500 rounded-full pointer-events-none" 
                    style={{ left: `${minPercent}%`, width: `${maxPercent - minPercent}%` }} 
                  />
                  
                  <input 
                    type="range" min={MIN} max={MAX} value={range[0]}
                    onChange={(e) => {
                      const val = Math.min(Number(e.target.value), range[1] - 1);
                      setRange([val, range[1]]);
                    }}
                    className="absolute w-full appearance-none bg-transparent pointer-events-none z-20
                      [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-indigo-600 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-grab"
                  />
                  
                  <input 
                    type="range" min={MIN} max={MAX} value={range[1]}
                    onChange={(e) => {
                      const val = Math.max(Number(e.target.value), range[0] + 1);
                      setRange([range[0], val]);
                    }}
                    className="absolute w-full appearance-none bg-transparent pointer-events-none z-30
                      [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-indigo-600 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-grab"
                  />
                </div>

                <div className="flex justify-between items-center mt-4 text-sm font-bold text-indigo-700">
                  <span className="bg-indigo-50 px-2 py-1 rounded">{ALL_NOTES[range[0]].display}</span>
                  <span className="text-slate-400 text-xs">to</span>
                  <span className="bg-indigo-50 px-2 py-1 rounded">{ALL_NOTES[range[1]].display}</span>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* 우측: 게임 화면 */}
        <div className="flex-1 flex flex-col bg-white relative">
          
          <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-white">
            <div className="flex items-center gap-2">
              <Music className="w-5 h-5 text-indigo-600" />
              <h1 className="text-lg font-bold text-slate-800">슬라이딩 음표 읽기</h1>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-sm font-semibold text-slate-600">
                점수: <span className="text-indigo-600 text-xl ml-1">{uiScore}</span>
              </div>
              <div className="text-sm font-semibold text-slate-600">
                연속: <span className="text-orange-500 text-xl ml-1">{uiStreak}</span>
              </div>
              <button onClick={resetGame} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors">
                <RefreshCw className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          </div>

          <div className="py-4 flex flex-col items-center justify-center relative flex-1 min-h-[260px] bg-white overflow-hidden">
            <canvas ref={canvasRef} className="block" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} />
            
            {!isVexLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/90">
                <span className="text-sm font-medium text-indigo-500 animate-pulse">악보 엔진 로딩 중...</span>
              </div>
            )}

            <div className="absolute bottom-4 h-6 flex items-center justify-center w-full pointer-events-none">
              {feedback === 'correct' && <span className="text-green-500 text-base font-bold flex items-center gap-1"><CheckCircle2 className="w-5 h-5" /> 정답!</span>}
              {feedback === 'incorrect' && <span className="text-red-500 text-base font-bold flex items-center gap-1"><XCircle className="w-5 h-5" /> 오답!</span>}
              {feedback === 'missed' && <span className="text-orange-500 text-base font-bold flex items-center gap-1"><AlertCircle className="w-5 h-5" /> 놓침!</span>}
            </div>
          </div>

          {/* 건반 UI */}
          <div className="p-6 bg-slate-100 border-t border-slate-200 pb-8">
            <div className="flex flex-col gap-2 max-w-[360px] mx-auto">
              {/* 검은 건반 */}
              <div className="flex justify-center gap-2">
                {BLACK_KEYS.map((key, idx) => (
                  key.spacer ? (
                    <div key={`spacer-${idx}`} className="w-[46px]"></div>
                  ) : (
                    <button
                      key={key.id}
                      onClick={() => handleGuess(key.id)}
                      disabled={!isVexLoaded || !useAccidentals}
                      className={`
                        w-[46px] h-12 rounded text-xs font-bold transition-all duration-150
                        ${useAccidentals 
                          ? 'bg-slate-800 text-white hover:bg-slate-700 active:bg-slate-900 shadow-md' 
                          : 'bg-slate-300 text-slate-400 cursor-not-allowed opacity-50'
                        }
                      `}
                    >
                      {key.id.split('/')[0]}<br/><span className="text-[10px] font-normal">{key.id.split('/')[1]}</span>
                    </button>
                  )
                ))}
              </div>
              
              {/* 흰 건반 */}
              <div className="flex justify-center gap-2">
                {WHITE_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => handleGuess(key)}
                    disabled={!isVexLoaded}
                    className="w-[46px] h-14 bg-white border border-slate-300 rounded shadow-sm text-indigo-700 text-lg font-bold hover:bg-indigo-50 hover:border-indigo-400 active:bg-slate-100 transition-all duration-150"
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}