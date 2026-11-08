document.querySelectorAll('div.sourceCode').forEach(function (block) {
  // пропускаем, если внутри другого sourceCode
  if (block.parentElement.closest('div.sourceCode')) return;

  const details = document.createElement('details');
  details.className = 'code-fold';

  const summary = document.createElement('summary');
  summary.textContent = 'Показать код';

  details.appendChild(summary);
  block.parentNode.insertBefore(details, block);
  details.appendChild(block);
});