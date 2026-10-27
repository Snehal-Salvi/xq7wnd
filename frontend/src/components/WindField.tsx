import { useEffect, useRef } from "react";

/**
 * Wind streamlines drawn on a canvas behind the hero: particles drift through a
 * smooth, slowly changing flow field and leave fading trails.
 *
 * Decorative only (aria-hidden). It pauses when the tab is hidden or the hero is
 * off-screen, and draws a single still frame when the viewer prefers reduced motion.
 */
export function WindField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let width = 0;
    let height = 0;
    let particles: { x: number; y: number; age: number; life: number }[] = [];
    let frame = 0;
    let visible = true;
    let t = 0;

    const spawn = (anywhere: boolean) => ({
      x: anywhere ? Math.random() * width : -10,
      y: Math.random() * height,
      age: 0,
      life: 120 + Math.random() * 180,
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(900, (width * height) / 1400));
      particles = Array.from({ length: count }, () => spawn(true));
    };

    // Prevailing westerly with gentle meanders, like a synoptic wind map.
    const flow = (x: number, y: number) => {
      const a =
        Math.sin(x * 0.0042 + t * 0.6) * 0.55 +
        Math.cos(y * 0.0065 - t * 0.4) * 0.45 +
        Math.sin((x + y) * 0.0021 + t * 0.25) * 0.3;
      return [Math.cos(a * 0.9) * 1.25, Math.sin(a * 0.9) * 0.9] as const;
    };

    const step = () => {
      t += 0.004;
      // Fade previous trails instead of clearing, which draws the streaks.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 0.07)";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        const [dx, dy] = flow(p.x, p.y);
        const nx = p.x + dx;
        const ny = p.y + dy;
        const fade = Math.sin((p.age / p.life) * Math.PI);
        ctx.strokeStyle = `rgba(214, 233, 255, ${0.42 * fade})`;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        p.x = nx;
        p.y = ny;
        p.age++;
        if (p.age > p.life || p.x > width + 10 || p.y < -10 || p.y > height + 10) {
          particles[i] = spawn(p.age > p.life);
        }
      }
    };

    const loop = () => {
      if (visible && !document.hidden) step();
      frame = requestAnimationFrame(loop);
    };

    resize();
    if (reduceMotion) {
      for (let i = 0; i < 160; i++) step();
    } else {
      frame = requestAnimationFrame(loop);
    }

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reduceMotion) for (let i = 0; i < 160; i++) step();
    });
    resizeObserver.observe(canvas);
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    visibility.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibility.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="wind-field" aria-hidden />;
}
