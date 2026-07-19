const EXT_KEY = 'galpi';

let _api = null;
let backdropEl = null;
let modalEl = null;
let vpListeners = [];

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
    if (window.SillyTavern?.getContext) {
        return window.SillyTavern.getContext();
    }

    if (_api?.getContext) {
        return _api.getContext();
    }

    return null;
}

function ensureSettings() {
    const ctx = getCtx();
    const store =
        ctx?.extensionSettings
        ?? ctx?.extension_settings
        ?? window.extension_settings
        ?? {};

    if (!store[EXT_KEY]) {
        store[EXT_KEY] = { ...DEFAULT_SETTINGS };
    }

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

function getCurrentChatLabel() {
    const ctx = getCtx();
    return (
        ctx?.name2
        || ctx?.characterName
        || ctx?.characters?.[ctx?.characterId]?.name
        || '현재 채팅'
    );
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
                <div class="galpi-empty">
                    <div class="galpi-empty-icon">🗂️</div>
                    <b>아직 스토리 카드가 없어요.</b>
                    <span>다음 버전에서 카드 생성과 저장 기능을 연결합니다.</span>
                </div>
                <button id="galpi-new-card" class="menu_button galpi-wide" type="button" disabled>
                    + 새 카드
                </button>
            </section>

            <section class="galpi-view" data-view="advisor">
                <div class="galpi-empty">
                    <div class="galpi-empty-icon">✨</div>
                    <b>AI 전개 상담</b>
                    <span>현재 롤플을 분석해 전개 후보를 제안하는 기능이 들어올 자리입니다.</span>
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
            <span class="galpi-version">v0.1.0</span>
            <button id="galpi-footer-close" class="menu_button" type="button">닫기</button>
        </div>
    `;

    document.documentElement.appendChild(modalEl);

    modalEl.querySelector('#galpi-close').onclick = closeModal;
    modalEl.querySelector('#galpi-footer-close').onclick = closeModal;

    modalEl.querySelectorAll('.galpi-tab').forEach((button) => {
        button.addEventListener('click', () => {
            const tab = button.dataset.tab;

            modalEl.querySelectorAll('.galpi-tab').forEach((item) => {
                item.classList.toggle('active', item === button);
            });

            modalEl.querySelectorAll('.galpi-view').forEach((view) => {
                view.classList.toggle('active', view.dataset.view === tab);
            });
        });
    });
}

function openModal() {
    if (!backdropEl || !modalEl) {
        buildModal();
    }

    modalEl.querySelector('#galpi-chat-label').textContent = getCurrentChatLabel();

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
            console.log('[갈피] v0.1.0 완전 로드');
        } catch (error) {
            console.error('[갈피] 초기화 오류:', error);
        }
    })();
});