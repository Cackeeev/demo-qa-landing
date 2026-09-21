const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');

function closeMenu() {
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Открыть меню');
  navigation.classList.remove('is-open');
}

menuToggle.addEventListener('click', () => {
  const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Открыть меню' : 'Закрыть меню');
  navigation.classList.toggle('is-open', !isOpen);
});
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
    closeMenu();
    menuToggle.focus();
  }
});
document.addEventListener('click', event => {
  if (!event.target.closest('.header')) closeMenu();
});
window.matchMedia('(min-width: 761px)').addEventListener('change', closeMenu);

const result = document.querySelector('#demo-result');
const emptyResult = document.querySelector('#empty-result');
const status = document.querySelector('#demo-status');
const testCases = document.querySelector('#test-cases');
const testCaseCount = document.querySelector('#test-case-count');

const scenarios = {
  email: {
    name: 'изменения email',
    cases: [
      'Изменение email на валидный адрес',
      'Изменение на уже занятый email',
      'Проверка некорректного формата',
      'Отправка пустого значения',
      'Проверка максимальной длины email'
    ]
  },
  password: {
    name: 'изменения пароля',
    cases: [
      'Смена пароля при корректном текущем пароле',
      'Отказ при неверном текущем пароле',
      'Проверка минимальной длины нового пароля',
      'Проверка совпадения пароля и подтверждения',
      'Вход с новым паролем после смены'
    ]
  },
  registration: {
    name: 'регистрации',
    cases: [
      'Регистрация с корректными данными',
      'Регистрация с уже занятым email',
      'Проверка обязательных полей',
      'Проверка некорректного email',
      'Проверка пароля, не отвечающего требованиям'
    ]
  },
  login: {
    name: 'авторизации',
    cases: [
      'Вход с корректными учетными данными',
      'Отказ при неверном пароле',
      'Отказ для незарегистрированного пользователя',
      'Проверка пустых полей',
      'Проверка блокировки после серии ошибок'
    ]
  },
  recovery: {
    name: 'восстановления пароля',
    cases: [
      'Запрос восстановления для зарегистрированного email',
      'Запрос для незарегистрированного email',
      'Проверка срока действия ссылки',
      'Повторное использование ссылки',
      'Установка нового пароля по действующей ссылке'
    ]
  },
  profile: {
    name: 'изменения профиля',
    cases: [
      'Сохранение корректных данных профиля',
      'Проверка обязательных полей',
      'Проверка допустимой длины имени',
      'Отмена изменений без сохранения',
      'Сохранение профиля при сетевой ошибке'
    ]
  }
};

function renderList(list, items) {
  list.replaceChildren(...items.map(item => {
    const element = document.createElement('li');
    element.textContent = item;
    return element;
  }));
}

document.querySelectorAll('.scenario-button').forEach(button => {
  button.addEventListener('click', () => {
    const scenario = scenarios[button.dataset.scenario];
    if (!scenario) return;

    document.querySelectorAll('.scenario-button').forEach(option => {
      option.setAttribute('aria-pressed', String(option === button));
    });

    renderList(testCases, scenario.cases);
    testCaseCount.textContent = `${scenario.cases.length} проверок`;
    emptyResult.hidden = true;
    result.hidden = false;
    status.textContent = `Demo-анализ готов: ${scenario.cases.length} тест-кейсов для ${scenario.name}.`;
  });
});

document.querySelector('.scenario-button[data-scenario="email"]').click();

document.querySelectorAll('.faq-item button').forEach(button => {
  button.addEventListener('click', () => {
    const isExpanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!isExpanded));
    document.getElementById(button.getAttribute('aria-controls')).hidden = isExpanded;
  });
});
