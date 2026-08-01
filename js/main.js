(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Hero-слайдер ---------- */
  var hero = document.querySelector('.hero');
  if (hero) {
    var slides = hero.querySelectorAll('.hero__slide');
    var dotsWrap = hero.querySelector('.hero__dots');
    var current = 0;
    var timer = null;
    var INTERVAL = 6000;

    var dots = [];
    slides.forEach(function (_, i) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'hero__dot' + (i === 0 ? ' is-active' : '');
      dot.setAttribute('aria-label', 'Слайд ' + (i + 1));
      dot.addEventListener('click', function () { goTo(i); restart(); });
      dotsWrap.appendChild(dot);
      dots.push(dot);
    });

    function goTo(index) {
      slides[current].classList.remove('is-active');
      dots[current].classList.remove('is-active');
      current = (index + slides.length) % slides.length;
      slides[current].classList.add('is-active');
      dots[current].classList.add('is-active');
    }

    function next() { goTo(current + 1); }
    function prev() { goTo(current - 1); }

    function start() {
      if (prefersReducedMotion || timer) return;
      timer = setInterval(next, INTERVAL);
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }
    function restart() { stop(); start(); }

    hero.querySelector('.hero__arrow--prev').addEventListener('click', function () { prev(); restart(); });
    hero.querySelector('.hero__arrow--next').addEventListener('click', function () { next(); restart(); });

    /* свайп на телефоне */
    var touchX = null;
    hero.addEventListener('touchstart', function (e) {
      touchX = e.changedTouches[0].clientX;
    }, { passive: true });
    hero.addEventListener('touchend', function (e) {
      if (touchX === null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); restart(); }
      touchX = null;
    }, { passive: true });

    /* пауза, когда вкладка не видна */
    document.addEventListener('visibilitychange', function () {
      document.hidden ? stop() : start();
    });

    start();
  }

  /* ---------- Шапка при скролле ---------- */
  var header = document.getElementById('header');
  if (header && hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      header.classList.toggle('header--solid', !entries[0].isIntersecting);
    }, { rootMargin: '-72px 0px 0px 0px' }).observe(hero);
  } else if (header) {
    header.classList.add('header--solid');
  }

  /* ---------- Подсветка активного пункта меню ---------- */
  var navLinks = document.querySelectorAll('.nav__link');
  if (navLinks.length && 'IntersectionObserver' in window) {
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (link) {
          link.classList.toggle('is-active',
            link.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    ['about', 'gallery', 'contacts'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) sectionObserver.observe(el);
    });
  }

  /* ---------- Мобильное меню ---------- */
  var burger = document.querySelector('.burger');
  var mobileMenu = document.getElementById('mobile-menu');
  if (burger && mobileMenu) {
    function setMenu(open) {
      document.body.classList.toggle('menu-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      mobileMenu.setAttribute('aria-hidden', String(!open));
    }
    burger.addEventListener('click', function () {
      setMenu(!document.body.classList.contains('menu-open'));
    });
    mobileMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function (e) {
        setMenu(false);
        /* прокрутка к якорю после снятия overflow: hidden */
        var href = link.getAttribute('href');
        if (href && href.charAt(0) === '#') {
          var target = document.querySelector(href);
          if (target) {
            e.preventDefault();
            setTimeout(function () {
              target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
              if (history.replaceState) history.replaceState(null, '', href);
            }, 50);
          }
        }
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('menu-open')) setMenu(false);
    });
  }

  /* ---------- Лайтбокс галереи ---------- */
  var lightbox = document.getElementById('lightbox');
  var galleryLinks = Array.prototype.slice.call(document.querySelectorAll('.gcard__link'));
  if (lightbox && typeof lightbox.showModal === 'function' && galleryLinks.length) {
    var lbImg = lightbox.querySelector('.lightbox__img');
    var lbCaption = lightbox.querySelector('.lightbox__caption');
    var lbIndex = 0;

    function showImage(index) {
      lbIndex = (index + galleryLinks.length) % galleryLinks.length;
      var link = galleryLinks[lbIndex];
      lbImg.src = link.getAttribute('href');
      lbImg.alt = link.querySelector('img').alt;
      lbCaption.textContent = link.dataset.caption || '';
    }

    galleryLinks.forEach(function (link, i) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        showImage(i);
        lightbox.showModal();
      });
    });

    lightbox.querySelector('.lightbox__close').addEventListener('click', function () {
      lightbox.close();
    });
    lightbox.querySelector('.lightbox__arrow--prev').addEventListener('click', function () {
      showImage(lbIndex - 1);
    });
    lightbox.querySelector('.lightbox__arrow--next').addEventListener('click', function () {
      showImage(lbIndex + 1);
    });
    lightbox.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') showImage(lbIndex - 1);
      if (e.key === 'ArrowRight') showImage(lbIndex + 1);
    });
    /* клик по подложке закрывает */
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) lightbox.close();
    });
  }
})();
