/* ==========================================================================
   Hubdex Store - Main script (no dependencies)
   ========================================================================== */
(function () {
    'use strict';

    var doc = document.documentElement;
    doc.classList.add('js');

    /* ---------- Sticky header + back to top ---------- */
    var header = document.querySelector('.site-header');
    var toTop = document.querySelector('.to-top');
    function onScroll() {
        var y = window.scrollY || window.pageYOffset;
        if (header) header.classList.toggle('scrolled', y > 10);
        if (toTop) toTop.classList.toggle('show', y > 600);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* ---------- Mobile navigation ---------- */
    var toggle = document.querySelector('.nav-toggle');
    if (toggle) {
        var setNav = function (open) {
            document.body.classList.toggle('nav-open', open);
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        };
        toggle.addEventListener('click', function () {
            setNav(!document.body.classList.contains('nav-open'));
        });
        document.querySelectorAll('.site-nav a').forEach(function (a) {
            a.addEventListener('click', function () { setNav(false); });
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') setNav(false);
        });
    }

    /* ---------- Scroll reveal ---------- */
    var revealEls = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        revealEls.forEach(function (el, i) {
            el.style.transitionDelay = Math.min((i % 6) * 70, 350) + 'ms';
            io.observe(el);
        });
    } else {
        revealEls.forEach(function (el) { el.classList.add('is-visible'); });
    }

    /* ---------- Countdown ---------- */
    var countdown = document.getElementById('countdown');
    if (countdown) {
        var target = new Date(countdown.getAttribute('data-launch')).getTime();
        var units = {};
        countdown.querySelectorAll('[data-unit]').forEach(function (el) {
            units[el.getAttribute('data-unit')] = el;
        });
        var pad = function (n) { return n < 10 ? '0' + n : String(n); };
        var set = function (unit, value) {
            var el = units[unit];
            if (!el) return;
            var v = unit === 'days' ? (value < 10 ? '0' + value : String(value)) : pad(value);
            if (el.textContent !== v) {
                el.textContent = v;
                el.classList.remove('tick');
                void el.offsetWidth;
                el.classList.add('tick');
            }
        };
        var timer;
        var update = function () {
            var diff = target - Date.now();
            if (isNaN(diff) || diff <= 0) {
                clearInterval(timer);
                countdown.classList.add('launched');
                countdown.textContent = 'Hubdex Store is launching now - stay tuned!';
                return;
            }
            set('days', Math.floor(diff / 86400000));
            set('hours', Math.floor((diff / 3600000) % 24));
            set('minutes', Math.floor((diff / 60000) % 60));
            set('seconds', Math.floor((diff / 1000) % 60));
        };
        update();
        timer = setInterval(update, 1000);
    }

    /* ---------- Notify Me form (AJAX with graceful fallback) ---------- */
    var notify = document.querySelector('.notify-form');
    if (notify && window.fetch && window.FormData) {
        var msg = notify.querySelector('.form-message');
        var input = notify.querySelector('input[type="email"]');
        var btn = notify.querySelector('button[type="submit"]');
        var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

        var show = function (text, ok) {
            msg.textContent = text;
            msg.className = 'form-message ' + (ok ? 'is-success' : 'is-error');
            if (!ok) {
                notify.classList.remove('shake');
                void notify.offsetWidth;
                notify.classList.add('shake');
            }
        };

        notify.addEventListener('submit', function (e) {
            e.preventDefault();
            var email = input.value.trim();
            if (!emailRe.test(email)) {
                show('Please enter a valid e-mail address.', false);
                input.focus();
                return;
            }
            btn.classList.add('is-loading');
            btn.disabled = true;

            fetch(notify.action, {
                method: 'POST',
                body: new FormData(notify),
                headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'same-origin'
            })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    show(data.message || 'Thank you!', !!data.ok);
                    if (data.ok) notify.reset();
                })
                .catch(function () {
                    show('Something went wrong. Please try again in a moment.', false);
                })
                .then(function () {
                    btn.classList.remove('is-loading');
                    btn.disabled = false;
                });
        });
    }

    /* ---------- Contact form client-side validation ---------- */
    var contact = document.querySelector('form[data-validate]');
    if (contact) {
        var rules = {
            name: function (v) { return v.trim().length >= 2 ? '' : 'Please enter your full name.'; },
            email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Please enter a valid e-mail address.'; },
            phone: function (v) { return v.trim() === '' || /^[+()\d\s.\-]{6,30}$/.test(v.trim()) ? '' : 'Please enter a valid phone number.'; },
            message: function (v) { return v.trim().length >= 10 ? '' : 'Your message should be at least 10 characters.'; }
        };
        var validate = function (field) {
            var rule = rules[field.name];
            if (!rule) return true;
            var error = rule(field.value);
            var wrap = field.closest('.field');
            var holder = wrap.querySelector('.field-error');
            wrap.classList.toggle('has-error', !!error);
            holder.textContent = error;
            if (error) {
                field.setAttribute('aria-invalid', 'true');
                field.setAttribute('aria-describedby', holder.id);
            } else {
                field.removeAttribute('aria-invalid');
            }
            return !error;
        };
        Object.keys(rules).forEach(function (name) {
            var field = contact.elements[name];
            if (!field) return;
            field.addEventListener('blur', function () { validate(field); });
            field.addEventListener('input', function () {
                if (field.closest('.field').classList.contains('has-error')) validate(field);
            });
        });
        contact.addEventListener('submit', function (e) {
            var firstInvalid = null;
            Object.keys(rules).forEach(function (name) {
                var field = contact.elements[name];
                if (field && !validate(field) && !firstInvalid) firstInvalid = field;
            });
            if (firstInvalid) {
                e.preventDefault();
                firstInvalid.focus();
                return;
            }
            var b = contact.querySelector('button[type="submit"]');
            if (b) b.classList.add('is-loading');
        });
    }
})();
