'use client';

const COLORS = ['#EEC935', '#D1793F', '#C12D4C', '#406C9E', '#6EA050', '#83B6DD'];

export default function HeroParticulas() {
  const particles = Array.from({ length: 72 }, (_, i) => ({
    left: `${(i * 47) % 100}%`,
    top: `${(i * 71) % 100}%`,
    size: `${3 + (i % 4)}px`,
    delay: `${-(i % 12) / 2}s`,
    color: COLORS[i % COLORS.length],
  }));
  return (
    <div className="login-hero" aria-hidden="true">
      {particles.map((particle, i) => (
        <span
          className="hero-particle"
          key={i}
          style={{
            left: particle.left,
            top: particle.top,
            width: particle.size,
            height: particle.size,
            animationDelay: particle.delay,
            backgroundColor: particle.color,
          }}
        />
      ))}
    </div>
  );
}
