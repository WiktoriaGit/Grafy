import {
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from 'lucide-react'
import { SPEED_OPTIONS, type StepPlayer } from './useStepPlayer'

type Props = {
  player: StepPlayer
  disabled?: boolean
}

export default function AlgorithmPlayer({ player, disabled }: Props) {
  const inactive = disabled || player.stepCount === 0

  return (
    <div className="algo-player">
      <div className="algo-player-controls">
        <button type="button" className="algo-player-btn" onClick={player.first} disabled={inactive || player.isFirst} title="Pierwszy krok">
          <ChevronsLeft size={16} />
          <span>Pierwszy</span>
        </button>
        <button type="button" className="algo-player-btn" onClick={player.prev} disabled={inactive || player.isFirst} title="Poprzedni krok">
          <SkipBack size={16} />
          <span>Poprzedni</span>
        </button>
        <button
          type="button"
          className="algo-player-btn algo-player-play"
          onClick={player.toggle}
          disabled={inactive || !player.canPlay}
          title={player.playing ? 'Pauza' : 'Odtwarzaj'}
        >
          {player.playing ? <Pause size={17} /> : <Play size={17} />}
          <span>{player.playing ? 'Pauza' : 'Odtwarzaj'}</span>
        </button>
        <button type="button" className="algo-player-btn" onClick={player.next} disabled={inactive || player.isLast} title="Następny krok">
          <SkipForward size={16} />
          <span>Następny</span>
        </button>
        <button type="button" className="algo-player-btn" onClick={player.last} disabled={inactive || player.isLast} title="Ostatni krok">
          <ChevronsRight size={16} />
          <span>Ostatni</span>
        </button>
        <button type="button" className="algo-player-btn" onClick={player.reset} disabled={inactive} title="Reset animacji">
          <RotateCcw size={16} />
          <span>Reset</span>
        </button>

        <span className="algo-player-step" aria-live="polite">
          Krok {player.stepCount ? player.index + 1 : 0} z {player.stepCount}
        </span>

        <label className="algo-player-speed">
          Prędkość
          <select
            value={player.speed}
            disabled={inactive}
            onChange={e => player.setSpeed(Number(e.target.value))}
          >
            {SPEED_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="algo-player-scrubber">
        <span>Oś czasu animacji</span>
        <input
          type="range"
          min={0}
          max={Math.max(player.stepCount - 1, 0)}
          value={player.stepCount ? player.index : 0}
          disabled={inactive || player.stepCount <= 1}
          onChange={e => player.seek(Number(e.target.value))}
          aria-label="Przewijanie kroków animacji"
        />
      </label>
    </div>
  )
}
