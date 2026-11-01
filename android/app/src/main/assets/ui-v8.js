/* Rooz-e-Man v8 navigation layer.
   Keeps the proven planner/forms and database intact. No network calls. */
(() => {
  'use strict';
  const PAGE_LABELS = {
    home: 'خانه', planner: 'برنامهٔ هفتگی', reminders: 'یادآوری‌ها', baskets: 'سبد کارها',
    diary: 'دفتر روزانه', exercise: 'ورزش', language: 'مطالعهٔ زبان',
    notifications: 'صندوق اعلان‌ها', settings: 'پشتیبان‌گیری'
  };
  const pages = new Map(Array.from(document.querySelectorAll('main > section[data-page]'))
    .map(node => [node.dataset.page, node]));
  const mainNav = document.querySelector('.app-bottom-nav');
  const more = document.getElementById('moreMenu');
  const scrim = document.getElementById('moreScrim');
  const moreButton = document.getElementById('moreMenuButton');
  let active = 'home';

  function closeMore() {
    more.hidden = true;
    scrim.hidden = true;
    moreButton.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  }
  function openMore() {
    more.hidden = false;
    scrim.hidden = false;
    moreButton.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-open');
    more.querySelector('button[data-go]')?.focus();
  }
  function pageFromLocation() {
    const match = /^#page=([a-z]+)$/.exec(location.hash);
    return match && pages.has(match[1]) ? match[1] : 'home';
  }
  function show(page, options = {}) {
    if (!pages.has(page)) page = 'home';
    closeMore();
    active = page;
    for (const [id, section] of pages) {
      section.classList.toggle('active-view', id === page);
      section.setAttribute('aria-hidden', String(id !== page));
    }
    for (const button of mainNav.querySelectorAll('[data-go]')) {
      if (button.dataset.go === page) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    if (['diary','exercise','language','notifications','settings'].includes(page)) {
      moreButton.classList.add('secondary-active');
    } else moreButton.classList.remove('secondary-active');
    document.title = `${PAGE_LABELS[page]} | روزِ من`;
    if (options.history) history.pushState({page}, '', '#page='+page);
    if (options.scroll !== false) window.scrollTo({top:0,behavior:'instant'});
    if (options.focus) {
      const header=pages.get(page).querySelector('h1, h2');
      if (header) {header.tabIndex=-1;header.focus({preventScroll:true});}
    }
  }
  document.documentElement.classList.add('nav-v8');
  show(pageFromLocation(), {scroll:false});
  document.addEventListener('click', (event) => {
    const goto = event.target.closest('[data-go]');
    if (goto) {event.preventDefault();show(goto.dataset.go,{history:true,focus:true});return;}
    const quick = event.target.closest('[data-action]');
    if (quick) {
      event.preventDefault();
      if (quick.dataset.actionPage) show(quick.dataset.actionPage,{history:true});
      document.getElementById(quick.dataset.action)?.click();
    }
  });
  moreButton.addEventListener('click', () => more.hidden ? openMore() : closeMore());
  document.getElementById('closeMore').addEventListener('click', () => {closeMore();moreButton.focus();});
  scrim.addEventListener('click', closeMore);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !more.hidden) {closeMore();moreButton.focus();}
    if (e.key === 'Tab' && !more.hidden) {
      const tabbable = Array.from(more.querySelectorAll('button:not([disabled])'));
      if (e.shiftKey && document.activeElement === tabbable[0]) {e.preventDefault();tabbable[tabbable.length-1].focus();}
      if (!e.shiftKey && document.activeElement === tabbable[tabbable.length-1]) {e.preventDefault();tabbable[0].focus();}
    }
  });
  window.addEventListener('popstate', () => show(pageFromLocation(), {scroll:false}));
  window.addEventListener('hashchange', () => {if (pageFromLocation()!==active)show(pageFromLocation(),{scroll:false});});

  function digits(value) {return new Intl.NumberFormat('fa-IR',{useGrouping:false}).format(value);}
  function write(id,value) {const el=document.getElementById(id); if(el)el.textContent=value;}
  function loadDashboard(data) {
    write('homeTodayTasks', digits(data.todayTasks));
    write('homePendingReminders', digits(data.pendingReminders));
    write('homePendingBaskets', digits(data.pendingBaskets));
    write('homeExercise', digits(data.exerciseMinutes)+' دقیقه');
    write('homeLanguage', digits(data.languageMinutes)+' دقیقه');
    const list=document.getElementById('homeUpcoming');
    list.replaceChildren();
    if (!data.upcoming.length) {
      const empty=document.createElement('p');empty.className='welcome-empty';
      empty.textContent='فعلاً کار نزدیکِ ثبت‌شده‌ای نداری. می‌تونی برای خودت یک یادآوری بسازی.';
      list.append(empty);
    }
    for (const item of data.upcoming) {
      const button=document.createElement('button');
      button.className='upcoming-item';button.type='button';button.dataset.go=item.page;
      const dot=document.createElement('span');dot.className='upcoming-kind';dot.textContent=item.type==='برنامه'?'◫':'◉';
      const content=document.createElement('span');content.className='upcoming-copy';
      const title=document.createElement('strong');title.textContent=item.title;
      const when=document.createElement('small');
      when.textContent=item.type+' · '+new Intl.DateTimeFormat('fa-IR-u-ca-persian',{weekday:'long',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(item.when));
      content.append(title,when);
      const arrow=document.createElement('span');arrow.className='upcoming-arrow';arrow.textContent='←';
      button.append(dot,content,arrow);list.append(button);
    }
  }
  window.addEventListener('rooz:data', e => loadDashboard(e.detail));
  write('homeDate',new Intl.DateTimeFormat('fa-IR-u-ca-persian',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date()));
  window.RoozUI = {navigate: page => show(page,{history:true,focus:true})};
})();
