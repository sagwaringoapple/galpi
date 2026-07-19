const EXT_KEY = 'galpi';

let _api = null;
let backdropEl = null;
let modalEl = null;
let vpListeners = [];
let saveTimer = null;
let currentChatKey = null;

const DEFAULT_SETTINGS = {
    analysisScope: 'recent',
    recentMessageCount: 20,
    defaultInjectionMode: 'oneShot',
    autoSave: true,
};

async function getApi() {
    if (_api) return _api;

    _api = {};
    for (const path of ['../../../extensions.js', '../../../../script.js']) {
        try {
            Object.assign(_api, await import(path));
        } catch (error) {
            console.warn('[갈피] import 실패:', path, error.message);
        }
    }

    return _api;
}

function getCtx() {
    if (window.SillyTavern?.getContext) return window.SillyTavern.getContext();
    if (_api?.getContext) return _api.getContext();
    return null;
}

function ensureSettings() {
    const ctx = getCtx();
    const store =
        ctx?.extensionSettings
        ?? ctx?.extension_settings
        ?? window.extension_settings
        ?? {};

    if (!store[EXT_KEY]) store[EXT_KEY] = { ...DEFAULT_SETTINGS };

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (store[EXT_KEY][key] === undefined) {
            store[EXT_KEY][key] = value;
        }
    }

    return store[EXT_KEY];
}

async function saveSettings() {
    try {
        const fn =
            _api?.saveSettingsDebounced
            ?? window.saveSettingsDebounced
            ?? (() => {});
        fn();
    } catch (error) {
        console.warn('[갈피] 설정 저장 실패:', error);
    }
}

function getCurrentChatInfo() {
    const ctx = getCtx() || {};
    const characterId = ctx.characterId ?? window.this_chid ?? 'no-character';
    const chatId =
        ctx.chatId
        ?? ctx.chat_id
        ?? ctx.chat?.[0]?.chat_id
        ?? location.pathname
        ?? 'no-chat';

    const name =
        ctx.name2
        || ctx.characterName
        || ctx.characters?.[characterId]?.name
        || '현재 채팅';

    return {
        name,
        key: `${characterId}::${chatId}`,
    };
}

function chatStorageKey(key) {
    return `galpi.chat.${key}`;
}

function loadChatData(key) {
    const fallback = {
        cards: [],
        activeTab: 'cards',
        updatedAt: null,
    };

    try {
        const raw = localStorage.getItem(chatStorageKey(key));
        return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
    } catch (error) {
        console.error('[갈피] 채팅 데이터 불러오기 실패:', error);
        return fallback;
    }
}

function collectCards() {
    if (!modalEl) return [];

    return [...modalEl.querySelectorAll('.galpi-card')].map((card) => ({
        id: card.dataset.id,
        title: card.querySelector('.galpi-card-title')?.value || '',
        content: card.querySelector('.galpi-card-content')?.value || '',
        memo: card.querySelector('.galpi-card-memo')?.value || '',
    }));
}

function saveCurrentChat() {
    if (!currentChatKey || !modalEl) return;

    const activeTab = modalEl.querySelector('.galpi-tab.active')?.dataset.tab || 'cards';

    const payload = {
        cards: collectCards(),
        activeTab,
        updatedAt: new Date().toISOString(),
    };

    try {
        localStorage.setItem(chatStorageKey(currentChatKey), JSON.stringify(payload));
        setSaveState('저장됨');
    } catch (error) {
        console.error('[갈피] 채팅 데이터 저장 실패:', error);
        setSaveState('저장 실패');
    }
}

function scheduleSave() {
    if (!ensureSettings().autoSave) {
        setSaveState('수정됨');
        return;
    }

    clearTimeout(saveTimer);
    setSaveState('저장 중…');
    saveTimer = setTimeout(saveCurrentChat, 450);
}

function setSaveState(text) {
    const el = modalEl?.querySelector('#galpi-save-state');
    if (el) el.textContent = text;
}

function esc(value = '') {
    const div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
}

function makeCardId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function positionModal() {
    if (!modalEl) return;

    const viewport = window.visualViewport;
    const width = viewport ? viewport.width : window.innerWidth;
    const height = viewport ? viewport.height : window.innerHeight;
    const offsetX = viewport ? viewport.offsetLeft : 0;
    const offsetY = viewport ? viewport.offsetTop : 0;

    const modalWidth = Math.min(620, Math.round(width * 0.94));
    const modalHeight = Math.round(height * 0.88);

    modalEl.style.left = Math.round(offsetX + (width - modalWidth) / 2) + 'px';
    modalEl.style.top = Math.round(offsetY + height * 0.06) + 'px';
    modalEl.style.width = modalWidth + 'px';
    modalEl.style.maxHeight = modalHeight + 'px';
    modalEl.style.transform = 'none';
}

function buildModal() {
    backdropEl = document.createElement('div');
    backdropEl.id = 'galpi-backdrop';
    backdropEl.addEventListener('click', closeModal);
    document.documentElement.appendChild(backdropEl);

    modalEl = document.createElement('div');
    modalEl.id = 'galpi-modal';
    modalEl.innerHTML = `
        <div class="galpi-modal-header">
            <div class="galpi-modal-title">
                <span class="galpi-modal-icon">📖</span>
                <div>
                    <div class="galpi-title-main">갈피</div>
                    <div id="galpi-chat-label" class="galpi-title-sub">현재 채팅</div>
                </div>
            </div>
            <button id="galpi-close" class="galpi-close" type="button">×</button>
        </div>

        <div class="galpi-modal-tabs">
            <button class="galpi-tab active" data-tab="cards" type="button">스토리 카드</button>
            <button class="galpi-tab" data-tab="advisor" type="button">AI 상담</button>
            <button class="galpi-tab" data-tab="inject" type="button">주입</button>
        </div>

        <div class="galpi-modal-body">
            <section class="galpi-view active" data-view="cards">
                <div class="galpi-card-toolbar">
                    <div>
                        <div class="galpi-section-title">스토리 카드</div>
                        <div id="galpi-card-count" class="galpi-muted">0개</div>
                    </div>
                    <button id="galpi-new-card" class="menu_button" type="button">+ 새 카드</button>
                </div>

                <div id="galpi-card-list" class="galpi-card-list"></div>
            </section>

            <section class="galpi-view" data-view="advisor">
                <div class="galpi-empty">
                    <div class="galpi-empty-icon">✨</div>
                    <b>AI 전개 상담</b>
                    <span>다음 버전에서 현재 롤플 분석과 전개 추천을 연결합니다.</span>
                </div>
            </section>

            <section class="galpi-view" data-view="inject">
                <div class="galpi-empty">
                    <div class="galpi-empty-icon">🧷</div>
                    <b>프롬프트 주입</b>
                    <span>선택한 카드만 이번 응답 또는 지속 방향으로 주입하는 기능이 들어올 자리입니다.</span>
                </div>
            </section>
        </div>

        <div class="galpi-modal-footer">
            <span id="galpi-save-state" class="galpi-save-state">저장됨</span>
            <span class="galpi-version">v0.2.0</span>
        </div>
    `;

    document.documentElement.appendChild(modalEl);

    modalEl.querySelector('#galpi-close').onclick = closeModal;

    modalEl.querySelectorAll('.galpi-tab').forEach((button) => {
        button.addEventListener('click', () => {
            const tab = button.dataset.tab;

            modalEl.querySelectorAll('.galpi-tab').forEach((item) => {
                item.classList.toggle('active', item === button);
            });

            modalEl.querySelectorAll('.galpi-view').forEach((view) => {
                view.classList.toggle('active', view.dataset.view === tab);
            });

            scheduleSave();
        });
    });

    modalEl.querySelector('#galpi-new-card').addEventListener('click', () => {
        const cards = collectCards();
        cards.push({
            id: makeCardId(),
            title: '새 전개 카드',
            content: '',
            memo: '',
        });
        renderCards(cards);
        scheduleSave();

        const last = modalEl.querySelector('.galpi-card:last-child .galpi-card-title');
        last?.focus();
        last?.select();
    });

    modalEl.querySelector('#galpi-card-list').addEventListener('input', (event) => {
        if (
            event.target.matches('.galpi-card-title')
            || event.target.matches('.galpi-card-content')
            || event.target.matches('.galpi-card-memo')
        ) {
            scheduleSave();
        }
    });

    modalEl.querySelector('#galpi-card-list').addEventListener('click', (event) => {
        const deleteButton = event.target.closest('.galpi-delete-card');
        if (!deleteButton) return;

        deleteButton.closest('.galpi-card')?.remove();

        if (!modalEl.querySelector('.galpi-card')) {
            renderCards([]);
        } else {
            updateCardCount();
        }

        scheduleSave();
    });
}

function renderCards(cards) {
    const list = modalEl?.querySelector('#galpi-card-list');
    if (!list) return;

    if (!cards.length) {
        list.innerHTML = `
            <div class="galpi-empty galpi-card-empty">
                <div class="galpi-empty-icon">🗂️</div>
                <b>아직 스토리 카드가 없어요.</b>
                <span>오른쪽 위의 ‘+ 새 카드’를 눌러 전개 아이디어를 저장해보세요.</span>
            </div>
        `;
        updateCardCount();
        return;
    }

    list.innerHTML = cards.map((card) => `
        <article class="galpi-card" data-id="${esc(card.id)}">
            <div class="galpi-card-head">
                <input
                    class="text_pole galpi-card-title"
                    value="${esc(card.title)}"
                    placeholder="카드 제목">
                <button class="menu_button galpi-delete-card" type="button">삭제</button>
            </div>

            <textarea
                class="text_pole galpi-card-content"
                placeholder="가능한 전개와 목적을 적으세요.">${esc(card.content)}</textarea>

            <textarea
                class="text_pole galpi-card-memo"
                placeholder="사용하기 좋은 시점, 피할 요소, 개인 메모">${esc(card.memo)}</textarea>
        </article>
    `).join('');

    updateCardCount();
}

function updateCardCount() {
    const count = modalEl?.querySelectorAll('.galpi-card').length || 0;
    const el = modalEl?.querySelector('#galpi-card-count');
    if (el) el.textContent = `${count}개`;
}

function switchTab(tab) {
    modalEl.querySelectorAll('.galpi-tab').forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === tab);
    });

    modalEl.querySelectorAll('.galpi-view').forEach((view) => {
        view.classList.toggle('active', view.dataset.view === tab);
    });
}

function openModal() {
    if (!backdropEl || !modalEl) buildModal();

    const chat = getCurrentChatInfo();
    currentChatKey = chat.key;
    const data = loadChatData(currentChatKey);

    modalEl.querySelector('#galpi-chat-label').textContent = chat.name;
    renderCards(Array.isArray(data.cards) ? data.cards : []);
    switchTab(data.activeTab || 'cards');
    setSaveState('저장됨');

    backdropEl.style.display = 'block';
    modalEl.style.display = 'flex';
    positionModal();

    const reposition = () => positionModal();

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', reposition);
        window.visualViewport.addEventListener('scroll', reposition);
        vpListeners = [reposition];
    }

    console.log('[갈피] 모달 열림');
}

function closeModal() {
    saveCurrentChat();

    if (backdropEl) backdropEl.style.display = 'none';
    if (modalEl) modalEl.style.display = 'none';

    if (window.visualViewport && vpListeners.length) {
        vpListeners.forEach((fn) => {
            window.visualViewport.removeEventListener('resize', fn);
            window.visualViewport.removeEventListener('scroll', fn);
        });
        vpListeners = [];
    }
}

function setupPanel() {
    try {
        if ($('#galpi-drawer').length) return;

        $('#extensions_settings').append(`
            <div class="inline-drawer" id="galpi-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>📖 갈피</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>

                <div class="inline-drawer-content">
                    <p class="galpi-panel-note">
                        모든 채팅방에 공통으로 적용되는 기본 설정입니다.
                    </p>

                    <label class="galpi-panel-label" for="galpi-scope">기본 분석 범위</label>
                    <select id="galpi-scope" class="text_pole">
                        <option value="recent">최근 메시지</option>
                        <option value="summaryRecent">요약 + 최근 메시지</option>
                        <option value="custom">사용자 선택</option>
                    </select>

                    <label class="galpi-panel-label" for="galpi-recent-count">최근 메시지 수</label>
                    <input id="galpi-recent-count" class="text_pole" type="number" min="2" max="200">

                    <label class="galpi-panel-label" for="galpi-injection-mode">기본 주입 방식</label>
                    <select id="galpi-injection-mode" class="text_pole">
                        <option value="oneShot">이번 응답에만</option>
                        <option value="persistent">지속 주입</option>
                        <option value="background">배경 방향</option>
                    </select>

                    <label class="galpi-check-row">
                        <span>채팅별 데이터 자동 저장</span>
                        <input id="galpi-auto-save" type="checkbox">
                    </label>
                </div>
            </div>
        `);

        const settings = ensureSettings();

        $('#galpi-scope').val(settings.analysisScope);
        $('#galpi-recent-count').val(settings.recentMessageCount);
        $('#galpi-injection-mode').val(settings.defaultInjectionMode);
        $('#galpi-auto-save').prop('checked', settings.autoSave);

        $('#galpi-scope').on('change', async function () {
            settings.analysisScope = $(this).val();
            await saveSettings();
        });

        $('#galpi-recent-count').on('change', async function () {
            const value = Math.max(2, Math.min(200, Number($(this).val()) || 20));
            settings.recentMessageCount = value;
            $(this).val(value);
            await saveSettings();
        });

        $('#galpi-injection-mode').on('change', async function () {
            settings.defaultInjectionMode = $(this).val();
            await saveSettings();
        });

        $('#galpi-auto-save').on('change', async function () {
            settings.autoSave = this.checked;
            await saveSettings();
        });

        console.log('[갈피] 설정 패널 완료');
    } catch (error) {
        console.error('[갈피] 설정 패널 오류:', error);
    }
}

function setupMenu() {
    try {
        if ($('#galpi-wand').length) return;

        $('#extensionsMenu').append(`
            <div class="list-group-item flex-container flexGap5" id="galpi-wand" title="갈피">
                <i class="fa-solid fa-book-open"></i>
                <span>갈피</span>
            </div>
        `);

        $('#galpi-wand').on('click', () => {
            $('#extensionsMenu')
                .closest('.popup')
                .find('.popup_close')
                .trigger('click');

            setTimeout(openModal, 80);
        });

        console.log('[갈피] 채팅 메뉴 완료');
    } catch (error) {
        console.error('[갈피] 채팅 메뉴 오류:', error);
    }
}

jQuery(() => {
    setupPanel();
    setupMenu();

    (async () => {
        try {
            await getApi();
            ensureSettings();
            console.log('[갈피] v0.2.0 완전 로드');
        } catch (error) {
            console.error('[갈피] 초기화 오류:', error);
        }
    })();
});