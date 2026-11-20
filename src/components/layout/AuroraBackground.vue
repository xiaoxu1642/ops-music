<template>
  <!-- 极光氛围层：色相跟随 --s-hue，强度跟随 --s-fx；blob 上禁止加 will-change（大面积 blur 层会塌帧率） -->
  <div class="aurora absolute inset-0 -z-1 overflow-hidden pointer-events-none" aria-hidden="true">
    <div class="blob blob-a" />
    <div class="blob blob-b" />
    <div class="blob blob-c" />
    <div class="grain" />
  </div>
</template>

<style scoped>
.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: calc(0.55 * var(--s-fx));
}

.blob-a {
  width: 54vw;
  height: 54vw;
  left: -10vw;
  top: -14vh;
  background: radial-gradient(circle at 50% 50%, hsl(var(--s-hue) 90% 60% / 0.5), transparent 70%);
  animation: aurora-drift-a 26s ease-in-out infinite alternate;
}

.blob-b {
  width: 46vw;
  height: 46vw;
  right: -8vw;
  top: 6vh;
  background: radial-gradient(
    circle at 50% 50%,
    hsl(calc(var(--s-hue) + 70) 85% 56% / 0.38),
    transparent 70%
  );
  animation: aurora-drift-b 34s ease-in-out infinite alternate;
}

.blob-c {
  width: 44vw;
  height: 44vw;
  left: 28vw;
  bottom: -20vh;
  background: radial-gradient(
    circle at 50% 50%,
    hsl(calc(var(--s-hue) + 185) 65% 55% / 0.22),
    transparent 70%
  );
  animation: aurora-drift-c 44s ease-in-out infinite alternate;
}

@keyframes aurora-drift-a {
  from {
    transform: translate(0, 0) scale(1);
  }
  to {
    transform: translate(10vw, 7vh) scale(1.18);
  }
}

@keyframes aurora-drift-b {
  from {
    transform: translate(0, 0) scale(1.1);
  }
  to {
    transform: translate(-8vw, 10vh) scale(0.94);
  }
}

@keyframes aurora-drift-c {
  from {
    transform: translate(0, 0) scale(0.95);
  }
  to {
    transform: translate(6vw, -7vh) scale(1.15);
  }
}

.grain {
  position: absolute;
  inset: 0;
  opacity: 0.05;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.6'/%3E%3C/svg%3E");
}

@media (prefers-reduced-motion: reduce) {
  .blob {
    animation: none;
  }
}
</style>
