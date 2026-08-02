(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hoverCapable = window.matchMedia('(hover: hover)').matches;

  /* меняет текст кнопки, не разрушая обёртку .btn__label */
  var setBtnLabel = function (btn, text) {
    var label = btn.querySelector('.btn__label');
    if (label) { label.textContent = text; } else { btn.textContent = text; }
  };

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
        var prev = slides[current];
        prev.classList.remove('is-active');
        prev.setAttribute('aria-hidden', 'true');
        /* уходящий кадр остаётся под «дверью», пока она раскрывается */
        prev.classList.add('is-prev');
        setTimeout(function () { prev.classList.remove('is-prev'); }, 1000);
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

    var quizBar = document.getElementById('quiz-bar');

    var showStep = function (i) {
      stepIndex = i;
      steps.forEach(function (s, k) {
        s.hidden = (k !== i);
        s.classList.remove('step-in');
      });
      /* перезапуск анимации входа шага */
      void steps[i].offsetWidth;
      steps[i].classList.add('step-in');
      progress.textContent = 'Шаг ' + (i + 1) + ' из ' + steps.length;
      if (quizBar) quizBar.style.width = ((i + 1) / steps.length * 100) + '%';
      backBtn.hidden = (i === 0);
      setBtnLabel(nextBtn2, (i === steps.length - 1) ? 'Готово' : 'Далее');
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
      if (quizBar) quizBar.style.width = '100%';
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

  /* ---------- Кнопки: обёртка текста, magnetic hover, ripple ---------- */
  document.querySelectorAll('.btn').forEach(function (btn) {
    if (!btn.querySelector('.btn__label')) {
      var label = document.createElement('span');
      label.className = 'btn__label';
      while (btn.firstChild) label.appendChild(btn.firstChild);
      btn.appendChild(label);
    }
    if (!prefersReducedMotion && hoverCapable) {
      btn.addEventListener('mousemove', function (e) {
        var r = btn.getBoundingClientRect();
        btn.style.setProperty('--tx', ((e.clientX - r.left - r.width / 2) * 0.18) + 'px');
        btn.style.setProperty('--ty', ((e.clientY - r.top - r.height / 2) * 0.3) + 'px');
      });
      btn.addEventListener('mouseleave', function () {
        btn.style.setProperty('--tx', '0px');
        btn.style.setProperty('--ty', '0px');
      });
    }
    btn.addEventListener('click', function (e) {
      if (prefersReducedMotion) return;
      var r = btn.getBoundingClientRect();
      var rip = document.createElement('span');
      rip.className = 'btn__ripple';
      var size = Math.max(r.width, r.height) * 2;
      rip.style.width = rip.style.height = size + 'px';
      rip.style.left = (e.clientX - r.left - size / 2) + 'px';
      rip.style.top = (e.clientY - r.top - size / 2) + 'px';
      btn.appendChild(rip);
      setTimeout(function () { rip.remove(); }, 700);
    });
  });

  /* ---------- Заголовки: появление по словам ---------- */
  if (!prefersReducedMotion && 'IntersectionObserver' in window) {
    var splitTargets = document.querySelectorAll('.hero__title, .section-head__title');
    splitTargets.forEach(function (el) {
      var text = el.textContent.trim();
      el.setAttribute('aria-label', text);
      el.textContent = '';
      text.split(/\s+/).forEach(function (word, i) {
        var s = document.createElement('span');
        s.className = 'w';
        s.setAttribute('aria-hidden', 'true');
        s.style.setProperty('--wi', i);
        s.textContent = word;
        el.appendChild(s);
        el.appendChild(document.createTextNode(' '));
      });
    });
    var wordsObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('words-in');
          wordsObserver.unobserve(en.target);
        }
      });
    }, { threshold: 0.35 });
    splitTargets.forEach(function (el) { wordsObserver.observe(el); });
  }

  /* ---------- Reveal: карточки и фото появляются со stagger ---------- */
  if (!prefersReducedMotion && 'IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in-view');
          revealObserver.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll(
      '.dir, .gcard, .process__step, .material, .project, .review, .faq__item, .about__photo, .showroom, .socials, .quiz__card, .quickform'
    ).forEach(function (el) {
      var idx = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      el.style.setProperty('--ri', Math.max(0, idx % 8));
      el.classList.add('reveal');
      revealObserver.observe(el);
    });
  }

  /* ---------- Счётчики цифр «накручиваются» от нуля ---------- */
  var factNums = document.querySelectorAll('.fact__num');
  if (factNums.length && !prefersReducedMotion && 'IntersectionObserver' in window) {
    var animateNumber = function (el) {
      var match = el.textContent.match(/^([\d\s\u00a0]+)(.*)$/);
      if (!match) return;
      var target = parseInt(match[1].replace(/[\s\u00a0]/g, ""), 10);
      var suffix = match[2] || '';
      if (!target) return;
      var format = function (n) {
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
      };
      var startTs = null;
      var DURATION = 1400;
      var tick = function (ts) {
        if (!startTs) startTs = ts;
        var p = Math.min((ts - startTs) / DURATION, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = format(Math.round(target * eased)) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    var numObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          animateNumber(en.target);
          numObserver.unobserve(en.target);
        }
      });
    }, { threshold: 0.6 });
    factNums.forEach(function (el) { numObserver.observe(el); });
  }

  /* ---------- Параллакс фона hero ---------- */
  if (!prefersReducedMotion && hero) {
    var slidesWrap = hero.querySelector('.hero__slides');
    var parallaxTicking = false;
    window.addEventListener('scroll', function () {
      if (parallaxTicking || !slidesWrap) return;
      parallaxTicking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY;
        if (y <= window.innerHeight * 1.2) {
          slidesWrap.style.transform = 'translateY(' + (y * 0.35) + 'px)';
        }
        parallaxTicking = false;
      });
    }, { passive: true });
  }

  /* ---------- Конфигуратор «Соберите свою дверь» ---------- */
  var constructorEl = document.getElementById('constructor');
  if (constructorEl) {
    var cfg = { model: 'classic2', finish: 'white', glass: 'clear', hardware: 'brass' };
    var cfgLabels = {
      model: { classic2: 'Классика · 2 филёнки', classic3: 'Классика · 3 филёнки', smooth: 'Гладкая современная', glass: 'Со стеклом' },
      finish: { white: 'эмаль «белая»', blue: 'эмаль «голубая»', olive: 'эмаль «олива»', graphite: 'эмаль «графит»', oak: 'шпон дуба' },
      glass: { clear: 'прозрачное стекло', satin: 'стекло сатин', reeded: 'рифлёное стекло' },
      hardware: { brass: 'латунь', chrome: 'хром', black: 'чёрная матовая фурнитура' }
    };
    var leafFills = { white: '#F2F0EB', blue: '#7C99B4', olive: '#5F6B4F', graphite: '#3A3D40', oak: 'url(#wood-oak)' };
    var mouldStrokes = { white: '#CFC9BF', blue: '#5E7C97', olive: '#48533D', graphite: '#232528', oak: '#654A32' };
    var hwFills = { brass: '#B08D57', chrome: '#C9CDD1', black: '#2B2B2B' };
    var glassFills = { clear: '#CFE0E6', satin: '#E6EAEA', reeded: '#D7E2E4' };

    var renderDoor = function () {
      var leaf = document.getElementById('d-leaf');
      var frame = document.getElementById('d-frame');
      leaf.setAttribute('fill', leafFills[cfg.finish]);
      frame.setAttribute('fill', leafFills[cfg.finish]);
      ['classic2', 'classic3', 'glass'].forEach(function (id) {
        var g = document.getElementById('d-model-' + id);
        if (g) g.style.display = (cfg.model === id) ? '' : 'none';
      });
      document.getElementById('d-model-classic2').setAttribute('stroke', mouldStrokes[cfg.finish]);
      document.getElementById('d-model-classic3').setAttribute('stroke', mouldStrokes[cfg.finish]);
      document.getElementById('d-glass-grid').setAttribute('stroke', mouldStrokes[cfg.finish]);
      document.getElementById('d-glass').setAttribute('fill', glassFills[cfg.glass]);
      document.getElementById('d-lever').setAttribute('fill', hwFills[cfg.hardware]);
      document.getElementById('d-rosette').setAttribute('fill', hwFills[cfg.hardware]);
      document.getElementById('copt-glass').hidden = (cfg.model !== 'glass');
      var parts = [cfgLabels.model[cfg.model], cfgLabels.finish[cfg.finish]];
      if (cfg.model === 'glass') parts.push(cfgLabels.glass[cfg.glass]);
      parts.push(cfgLabels.hardware[cfg.hardware]);
      document.getElementById('constructor-caption').textContent = parts.join(' · ');
    };

    var cfgText = function () {
      var parts = ['Конфигурация двери с сайта HomePorte:', 'Модель: ' + cfgLabels.model[cfg.model], 'Отделка: ' + cfgLabels.finish[cfg.finish]];
      if (cfg.model === 'glass') parts.push('Стекло: ' + cfgLabels.glass[cfg.glass]);
      parts.push('Фурнитура: ' + cfgLabels.hardware[cfg.hardware]);
      parts.push('Хочу узнать стоимость.');
      return parts.join('\n');
    };

    constructorEl.querySelectorAll('.copt').forEach(function (group) {
      var opt = group.getAttribute('data-opt');
      group.querySelectorAll('.chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          cfg[opt] = chip.getAttribute('data-value');
          group.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('is-on', c === chip); });
          renderDoor();
        });
      });
    });

    document.getElementById('constructor-send').addEventListener('click', function () {
      if (navigator.clipboard) navigator.clipboard.writeText(cfgText()).catch(function () {});
    });

    document.getElementById('constructor-to-quiz').addEventListener('click', function () {
      var comment = document.querySelector('#quiz-form [name="comment"]');
      if (comment) comment.value = cfgText().replace('Конфигурация двери с сайта HomePorte:\n', 'Дверь из конфигуратора — ');
      var quizSection = document.getElementById('quiz');
      if (quizSection) quizSection.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });

    renderDoor();
  }

  /* ---------- Exit-попап с гайдом ---------- */
  var exitOffer = document.getElementById('exit-offer');
  if (exitOffer && typeof exitOffer.showModal === 'function' && hoverCapable) {
    var exitShown = false;
    try { exitShown = sessionStorage.getItem('hp-exit') === '1'; } catch (e) {}
    var pageOpenedAt = Date.now();
    document.addEventListener('mouseout', function (e) {
      if (exitShown || exitOffer.open) return;
      if (e.relatedTarget) return;
      if (e.clientY > 12) return;
      if (Date.now() - pageOpenedAt < 15000) return;
      exitShown = true;
      try { sessionStorage.setItem('hp-exit', '1'); } catch (e2) {}
      exitOffer.showModal();
      document.body.classList.add('lightbox-open');
    });
    var closeExit = function () {
      document.body.classList.remove('lightbox-open');
      if (exitOffer.open) exitOffer.close();
    };
    exitOffer.querySelector('.exit-offer__close').addEventListener('click', closeExit);
    exitOffer.addEventListener('close', function () { document.body.classList.remove('lightbox-open'); });
    exitOffer.addEventListener('click', function (e) { if (e.target === exitOffer) closeExit(); });
  }

  /* ---------- Латунная линия прогресса скролла ---------- */
  var progressBar = document.getElementById('scroll-progress');
  if (progressBar) {
    var progressTicking = false;
    var updateProgress = function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progressBar.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%';
    };
    window.addEventListener('scroll', function () {
      if (progressTicking) return;
      progressTicking = true;
      requestAnimationFrame(function () { updateProgress(); progressTicking = false; });
    }, { passive: true });
    updateProgress();
  }

  /* ---------- Год в копирайте обновляется сам ---------- */
  var yearEl = document.getElementById('copyright-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

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
