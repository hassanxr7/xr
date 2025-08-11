(function () {
  const nav = document.querySelector('.navbar');
  const canvas = document.getElementById('hero-lines');
  const ctx = canvas.getContext('2d');
  const colors = [
    getComputedStyle(document.documentElement).getPropertyValue('--color-cyan').trim(),
    getComputedStyle(document.documentElement).getPropertyValue('--color-magenta').trim()
  ];
  let lines = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = document.querySelector('.hero').offsetHeight;
  }

  function initLines() {
    lines = [];
    for (let i = 0; i < 30; i++) {
      lines.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        length: 50 + Math.random() * 150,
        speed: 0.5 + Math.random(),
        color: colors[i % colors.length]
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    lines.forEach(l => {
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x + l.length, l.y);
      ctx.stroke();
      l.x += l.speed;
      if (l.x - l.length > canvas.width) {
        l.x = -l.length;
        l.y = Math.random() * canvas.height;
      }
    });
    requestAnimationFrame(draw);
  }

  function onScroll() {
    if (window.scrollY > 10) nav.classList.add('shadow');
    else nav.classList.remove('shadow');
  }

  window.addEventListener('resize', () => { resize(); initLines(); });
  window.addEventListener('scroll', onScroll);

  resize();
  initLines();
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    requestAnimationFrame(draw);
  }
  document.getElementById('year').textContent = new Date().getFullYear();
})();
