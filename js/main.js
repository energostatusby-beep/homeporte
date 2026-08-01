(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Hero-слайдер ---------- */
  var hero = document.querySelector('.hero');
  if (hero) {
    var slides = hero.querySelectorAll('.hero__slide');
    var dotsWrap = hero.querySelector('.hero__dots');
    var prevBtn = hero.querySelector('.hero__arrow--prev');
    var nextBtn = hero.querySelector('.hero__arrow--next');

    if (slides.length > 1 && dotsWrap && prevBtn && nextBtn) {
      var current = 0;
      var timer = null;
      var INTERVAL = 6000;

      var dots = [];
      slides.forEach(function (_, i) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'hero__dot' + (i === 0 ? ' is-active' : '');
        dot.setAttribute('aria-label', 'Слайд ' + (i + 1));
        if (i === 0) dot.setAttribute('aria-current', 'true');
        dot.addEventListener('click', function () { goTo(i); restart(); });
        dotsWrap.appendChild(dot);
        dots.push(dot);
      });

      var goTo = function (index) {
        slides[current].classList.remove('is-active');
        slides[current].setAttribute('aria-hidden', 'true');
        dots[current].classList.remove('is-active');
        dots[current].removeAttribute('aria-current');
        current = (index + slides.length) % slides.length;
        slides[current].classList.add('is-active');
        slides[current].removeAttribute('aria-hidden');
        dots[current].classList.add('is-active');
        dots[current].setAttribute('aria-current', 'true');
      };

      var next = function () { goTo(current + 1); };
      var prev = function () { goTo(current - 1); };

      var start = function () {
        if (prefersReducedMotion || timer) return;
        timer = setInterval(next, INTERVAL);
      };
      var stop = function () {
        if (timer) { clearInterval(timer); timer = null; }
      };
      var restart = function () { stop(); start(); };

      prevBtn.addEventListener('click', function () { prev(); restart(); });
      nextBtn.addEventListener('click', function () { next(); restart(); });

      /* свайп на телефоне */
      var touchX = null;
      hero.addEventListener('touchstart', function (e) {
        touchX = e.changedTouches[0].clientX;
      }, { passive: true });
      hero.addEventListener('touchend', function (e) {
        if (touchX === null) return;
        var dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 50) { if (dx < 0) { next(); } else { prev(); } restart(); }
        touchX = null;
      }, { passive: true });

      /* пауза: вкладка скрыта, курсор или фокус на слайдере (WCAG 2.2.2) */
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) { stop(); } else { start(); }
      });
      hero.addEventListener('mouseenter', stop);
      hero.addEventListener('mouseleave', start);
      hero.addEventListener('focusin', stop);
      hero.addEventListener('focusout', function (e) {
        if (!hero.contains(e.relatedTarget)) start();
      });

      start();
    }
  }

  /* ---------- Шапка при скролле ---------- */
  var header = document.getElementById('header');
  if (header && hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      var last = entries[entries.length - 1];
      header.classList.toggle('header--solid', !last.isIntersecting);
    }, { rootMargin: '-72px 0px 0px 0px' }).observe(hero);
  } else if (header) {
    header.classList.add('header--solid');
  }

  /* ---------- Подсветка активного пункта меню ---------- */
  var navLinks = document.querySelectorAll('.nav__link');
  if (navLinks.length && 'IntersectionObserver' in window) {
    var setActive = function (id, on) {
      navLinks.forEach(function (link) {
        if (link.getAttribute('href') === '#' + id) {
          link.classList.toggle('is-active', on);
        } else if (on) {
          link.classList.remove('is-active');
        }
      });
    };
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        setActive(entry.target.id, entry.isIntersecting);
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    ['about', 'gallery', 'projects', 'quiz', 'faq', 'contacts'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) sectionObserver.observe(el);
    });
  }

  /* ---------- Мобильное меню ---------- */
  var burger = document.querySelector('.burger');
  var mobileMenu = document.getElementById('mobile-menu');
  if (burger && mobileMenu) {
    var pageMain = document.querySelector('main');
    var pageFooter = document.querySelector('footer');

    var setMenu = function (open) {
      document.body.classList.toggle('menu-open', open);
      document.documentElement.classList.toggle('menu-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      mobileMenu.setAttribute('aria-hidden', String(!open));
      /* фон недоступен для Tab и скринридера, пока меню открыто */
      if (pageMain) pageMain.inert = open;
      if (pageFooter) pageFooter.inert = open;
      if (!open) burger.focus();
    };

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
    var lbClose = lightbox.querySelector('.lightbox__close');
    var lbPrev = lightbox.querySelector('.lightbox__arrow--prev');
    var lbNext = lightbox.querySelector('.lightbox__arrow--next');

    if (lbImg && lbCaption && lbClose && lbPrev && lbNext) {
      var lbIndex = 0;

      var showImage = function (index) {
        lbIndex = (index + galleryLinks.length) % galleryLinks.length;
        var link = galleryLinks[lbIndex];
        var thumb = link.querySelector('img');
        lbImg.src = link.getAttribute('href');
        lbImg.alt = thumb ? thumb.alt : '';
        lbCaption.textContent = link.dataset.caption || '';
      };

      var closeLightbox = function () {
        document.body.classList.remove('lightbox-open');
        lightbox.close();
      };

      galleryLinks.forEach(function (link, i) {
        link.addEventListener('click', function (e) {
          e.preventDefault();
          showImage(i);
          lightbox.showModal();
          document.body.classList.add('lightbox-open');
        });
      });

      /* страховка на все пути закрытия: cancel — Esc, close — любое закрытие */
      lightbox.addEventListener('cancel', function () {
        document.body.classList.remove('lightbox-open');
      });
      lightbox.addEventListener('close', function () {
        document.body.classList.remove('lightbox-open');
      });

      lbClose.addEventListener('click', closeLightbox);
      lbPrev.addEventListener('click', function () { showImage(lbIndex - 1); });
      lbNext.addEventListener('click', function () { showImage(lbIndex + 1); });

      lightbox.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') showImage(lbIndex - 1);
        if (e.key === 'ArrowRight') showImage(lbIndex + 1);
      });

      /* закрытие по подложке: и нажатие, и отпускание должны попасть в фон,
         иначе двойной клик по карточке или drag с фото закрывали бы лайтбокс */
      var pressOnBackdrop = false;
      lightbox.addEventListener('pointerdown', function (e) {
        pressOnBackdrop = (e.target === lightbox);
      });
      lightbox.addEventListener('click', function (e) {
        if (pressOnBackdrop && e.target === lightbox) closeLightbox();
        pressOnBackdrop = false;
      });
    }
  }

  /* ---------- Квиз «Рассчитать стоимость» ---------- */
  var quizForm = document.getElementById('quiz-form');
  if (quizForm) {
    var steps = Array.prototype.slice.call(quizForm.querySelectorAll('.quiz__step'));
    var progress = document.getElementById('quiz-progress');
    var nextBtn2 = document.getElementById('quiz-next');
    var backBtn = document.getElementById('quiz-back');
    var quizNav = document.getElementById('quiz-nav');
    var result = document.getElementById('quiz-result');
    var summary = document.getElementById('quiz-summary');
    var tgLink = document.getElementById('quiz-tg');
    var mailLink = document.getElementById('quiz-mail');
    var stepIndex = 0;

    var showStep = function (i) {
      stepIndex = i;
      steps.forEach(function (s, k) { s.hidden = (k !== i); });
      progress.textContent = 'Шаг ' + (i + 1) + ' из ' + steps.length;
      backBtn.hidden = (i === 0);
      nextBtn2.textContent = (i === steps.length - 1) ? 'Готово' : 'Далее';
    };

    var fieldValue = function (name) {
      var el = quizForm.querySelector('[name="' + name + '"]:checked') ||
               quizForm.querySelector('[name="' + name + '"]');
      return el ? el.value.trim() : '';
    };

    var buildSummary = function () {
      var lines = [
        'Заявка с сайта HomePorte',
        'Изделие: ' + fieldValue('item'),
        'Количество: ' + fieldValue('qty'),
        'Этап ремонта: ' + fieldValue('stage')
      ];
      var name = fieldValue('name');
      var contact = fieldValue('contact');
      var comment = fieldValue('comment');
      if (name) lines.push('Имя: ' + name);
      if (contact) lines.push('Контакт: ' + contact);
      if (comment) lines.push('Комментарий: ' + comment);
      return lines.join('\n');
    };

    nextBtn2.addEventListener('click', function () {
      if (stepIndex < steps.length - 1) {
        showStep(stepIndex + 1);
        return;
      }
      /* финал: собираем заявку */
      var text = buildSummary();
      summary.value = text;
      mailLink.href = 'mailto:homeporte@yandex.by?subject=' +
        encodeURIComponent('Заявка с сайта HomePorte') +
        '&body=' + encodeURIComponent(text);
      steps.forEach(function (s) { s.hidden = true; });
      quizNav.hidden = true;
      progress.textContent = 'Заявка сформирована';
      result.hidden = false;
    });

    backBtn.addEventListener('click', function () {
      if (stepIndex > 0) showStep(stepIndex - 1);
    });

    /* Telegram не принимает текст в ссылке на чат — копируем заявку в буфер */
    tgLink.addEventListener('click', function () {
      if (navigator.clipboard) navigator.clipboard.writeText(summary.value).catch(function () {});
      else { summary.select(); document.execCommand('copy'); }
    });

    quizForm.addEventListener('submit', function (e) { e.preventDefault(); });
    showStep(0);
  }

  /* ---------- Быстрая форма ---------- */
  var qfTg = document.getElementById('qf-tg');
  var qfMail = document.getElementById('qf-mail');
  if (qfTg && qfMail) {
    var qfText = function () {
      var name = (document.getElementById('qf-name').value || '').trim();
      var contact = (document.getElementById('qf-contact').value || '').trim();
      var lines = ['Заявка с сайта HomePorte — перезвоните мне'];
      if (name) lines.push('Имя: ' + name);
      if (contact) lines.push('Контакт: ' + contact);
      return lines.join('\n');
    };
    qfTg.addEventListener('click', function () {
      if (navigator.clipboard) navigator.clipboard.writeText(qfText()).catch(function () {});
    });
    qfMail.addEventListener('click', function () {
      qfMail.href = 'mailto:homeporte@yandex.by?subject=' +
        encodeURIComponent('Заявка с сайта HomePorte') +
        '&body=' + encodeURIComponent(qfText());
    });
  }

  /* ---------- Спотлайт на карточках галереи ---------- */
  var glowCards = document.querySelectorAll('.gcard');
  if (glowCards.length && window.matchMedia('(hover: hover)').matches) {
    glowCards.forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }
})();
