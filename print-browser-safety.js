(() => {
  const nativePrint = window.print.bind(window);

  window.print = () => {
    nativePrint();

    const confirmed = window.confirm(
      'Излезе ли бележката на хартия?\n\nOK = Да, отпечатана е.\nCancel = Не / не съм сигурен. Задачата ще остане за ръчна проверка.'
    );

    if (!confirmed) {
      throw new Error('[AMBIGUOUS_PRINT] Браузърният печат не е потвърден физически. Провери принтера преди повторение.');
    }
  };
})();
