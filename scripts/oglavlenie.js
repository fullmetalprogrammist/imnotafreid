(function() {
  const container = document.getElementById('oglavlenie');
  if (!container) return;

  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .filter(h => !container.contains(h));

  if (headings.length === 0) {
    container.textContent = 'Заголовки не найдены';
    return;
  }

  headings.forEach((h, i) => {
    if (!h.id) h.id = 'heading-' + i;
  });

  const rootUl = document.createElement('ul');
  const stack = [{ level: 0, ul: rootUl }];

  // Счётчики уровней 1..6
  const counters = [0, 0, 0, 0, 0, 0];

  headings.forEach(h => {
    const level = parseInt(h.tagName.substring(1), 10);

    // Обновляем счётчики: инкремент текущего уровня, сброс всех младших
    counters[level - 1]++;
    for (let i = level; i < 6; i++) counters[i] = 0;

    // Собираем номер вида "1.2.3"
    const number = counters.slice(0, level).join('.');

    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const currentUl = stack[stack.length - 1].ul;

    while (stack[stack.length - 1].level < level - 1) {
      const lastLi = currentUl.lastElementChild;
      let newUl;
      if (!lastLi) {
        const placeholderLi = document.createElement('li');
        currentUl.appendChild(placeholderLi);
        newUl = document.createElement('ul');
        placeholderLi.appendChild(newUl);
      } else {
        newUl = document.createElement('ul');
        lastLi.appendChild(newUl);
      }
      const parentLevel = stack[stack.length - 1].level + 1;
      stack.push({ level: parentLevel, ul: newUl });
    }

    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + h.id;

    // Номер и текст
    const numSpan = document.createElement('span');
    numSpan.className = 'toc-num';
    numSpan.textContent = number + '. ';

    a.appendChild(numSpan);
    a.appendChild(document.createTextNode(h.textContent.trim()));

    li.appendChild(a);
    currentUl.appendChild(li);

    const childUl = document.createElement('ul');
    li.appendChild(childUl);
    stack.push({ level, ul: childUl });
  });

  const removeEmpty = (ul) => {
    Array.from(ul.children).forEach(li => {
      const nested = li.querySelector(':scope > ul');
      if (nested) {
        removeEmpty(nested);
        if (nested.children.length === 0) nested.remove();
      }
    });
  };
  removeEmpty(rootUl);

  Array.from(rootUl.querySelectorAll('li')).forEach(li => {
    if (!li.querySelector(':scope > a')) li.remove();
  });

  container.appendChild(rootUl);

  /* ---------- Делаем список collapsable \ expandable ---------- */

  // Каждому li с вложенным ul — кнопка-треугольник и обёртка для содержимого
  Array.from(rootUl.querySelectorAll('li')).forEach(li => {
    const nested = li.querySelector(':scope > ul');
    if (nested) {
      li.classList.add('has-children');

      // Кнопка-треугольник
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'toc-toggle';
      toggle.setAttribute('aria-label', 'Свернуть/развернуть');
      toggle.setAttribute('aria-expanded', 'false');

      // Вставляем перед ссылкой (или в начало li, если ссылки нет)
      const link = li.querySelector(':scope > a');
      if (link) {
        li.insertBefore(toggle, link);
      } else {
        li.insertBefore(toggle, li.firstChild);
      }

      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = li.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    }
  });

  /* ---------- Кнопки Expand all / Collapse all ---------- */

  const controls = document.createElement('div');
  controls.className = 'toc-controls';

  const btnExpand = document.createElement('button');
  btnExpand.type = 'button';
  btnExpand.textContent = 'Expand all';
  btnExpand.className = 'toc-btn';

  const btnCollapse = document.createElement('button');
  btnCollapse.type = 'button';
  btnCollapse.textContent = 'Collapse all';
  btnCollapse.className = 'toc-btn';

  btnExpand.addEventListener('click', () => {
    Array.from(rootUl.querySelectorAll('li.has-children')).forEach(li => {
      li.classList.add('open');
      const t = li.querySelector(':scope > .toc-toggle');
      if (t) t.setAttribute('aria-expanded', 'true');
    });
  });

  btnCollapse.addEventListener('click', () => {
    Array.from(rootUl.querySelectorAll('li.has-children')).forEach(li => {
      li.classList.remove('open');
      const t = li.querySelector(':scope > .toc-toggle');
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  });

  controls.appendChild(btnExpand);
  controls.appendChild(btnCollapse);

  container.appendChild(controls);
  container.appendChild(rootUl);
})();