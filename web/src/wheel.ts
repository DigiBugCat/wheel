// Port of WheelSpin.gd + Rotation.gdshader.
//
// Godot's rotation shader computed current_rotation each frame as:
//   current_rotation = (max_time - TIME)^2 * speed
// where TIME ticks up from 0, max_time = 3.0, and speed = spin_amount / START_SPIN_TIME.
// The shader stopped rotating once current_rotation <= 0 (i.e. TIME >= max_time).
//
// That's quadratic ease-out applied to the *angle*, not decelerating speed.
// We reproduce the same curve as a CSS transform on the wheel <img>.
//
// The original timers chained START(1.7s) -> SLOW(0.8s) -> STOP(0.5s) = 3.0s,
// matching max_time. When max_time is reached, the wheel stops.

const MAX_TIME = 3.0;
const START_SPIN_TIME = 1.7;
const SPIN_MIN = 5;
const SPIN_MAX = 8;

/** Inclusive integer random, matching Godot's randi_range. */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export interface SpinHandle {
  /** Resolves when the wheel has fully stopped. */
  done: Promise<void>;
}

export function spinWheel(wheelEl: HTMLElement, rollSfx: HTMLAudioElement): SpinHandle {
  const spinAmount = randInt(SPIN_MIN, SPIN_MAX);
  const speed = spinAmount / START_SPIN_TIME;

  // Angle in "turns" (Godot's shader rotated UVs by radians, but since we're only
  // animating a sprite visually, we scale so the total feels similar: over 3s the
  // angle goes from (max_time^2 * speed) down to 0 — total delta = max_time^2 * speed
  // radians = 9 * speed radians. Convert to degrees for CSS.
  const totalRadians = MAX_TIME * MAX_TIME * speed;
  const totalDegrees = totalRadians * (180 / Math.PI);

  const startAngleDeg = totalDegrees;
  const endAngleDeg = 0;

  // Play the rolling sfx.
  rollSfx.currentTime = 0;
  void rollSfx.play().catch(() => {
    /* autoplay may be blocked; we'll rely on user gesture to unlock */
  });

  const start = performance.now();
  let done!: () => void;
  const finished = new Promise<void>((resolve) => {
    done = resolve;
  });

  function frame(now: number) {
    const t = Math.min((now - start) / 1000, MAX_TIME);
    // angle at time t = (max_time - t)^2 * speed radians
    const remaining = MAX_TIME - t;
    const angleRad = remaining * remaining * speed;
    const angleDeg = angleRad * (180 / Math.PI);

    // Normalize into [0, 360) range so CSS doesn't spin a huge number.
    // The delta from startAngleDeg is what matters visually; we just apply angleDeg mod 360.
    wheelEl.style.transform = `rotate(${angleDeg % 360}deg)`;

    if (t >= MAX_TIME) {
      wheelEl.style.transform = `rotate(${endAngleDeg}deg)`;
      rollSfx.pause();
      rollSfx.currentTime = 0;
      done();
      return;
    }
    requestAnimationFrame(frame);
  }

  // touch startAngleDeg so the compiler knows it's used for docs
  void startAngleDeg;
  requestAnimationFrame(frame);

  return { done: finished };
}
