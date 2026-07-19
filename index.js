import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';

const MODULE_NAME = 'galpi';
const DEFAULT_SETTINGS = {
    recentMessageCount: 20,
    analysisScope: 'recent',
    defaultInjectionMode: 'oneShot',
    autoSave: true,
};

let currentChatKey = null;
let saveTimer = null;

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function ensureGlobalSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = clone(DEFAULT_SETTINGS);
    }

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (extension_settings[MODULE_NAME][key] === undefined) {
            extension_settings[MODULE_NAME][key] = clone(value);
        }
    }

    return extension_settings[MODULE_NAME];
}

function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function getChatIdentity() {
    const context = getContext?.() || {};
    const characterId = context.characterId ?? context.character_id ?? 'no-character';
    const chatId = context.chatId ?? context.chat_id ?? context.chat?.[0]?.chat_id ?? 'no-chat';
    const name =
        context.name2
        || context.characterName
        || context.characters?.[characterId]?.name
        || '현재 채팅';

    return { key: `${characterId}::${chatId}`, name };
}

function storageKey(chatKey) {
    return `galpi.chat.${chatKey}`;
}

function loadChatData(chatKey) {
    const fallback = { memo: '', cards: [], activeTab: 'advisor' };

    try {
        const raw = localStorage.getItem(storageKey(chatKey));
        return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
    } catch (error) {
        console.error('[갈피] 채팅 데이터 불러오기 실패:', error);
        return fallback;
    }
}

function collectCurrentChatData() {
    const cards = [];

    document.querySelectorAll('#galpi_card_list .galpi-card').forEach((card) => {
        cards.push({
            id: String(card.dataset.id),
            title: card.querySelector('.galpi-card-title')?.value || '',
            content: card.querySelector('.galpi-card-content')?.value || '',
        });
    });

    return {
        memo: document.querySelector('#galpi_chat_memo')?.value || '',
        cards,
        activeTab: document.querySelector('.galpi-modal-tab.active')?.dataset.tab || 'advisor',
    };
}

function saveCurrentChat() {
    if (!currentChatKey) return;

    try {
        localStorage.setItem(
            storageKey(currentChatKey),
            JSON.stringify({ ...collectCurrentChatData(), updatedAt: new Date().toISOString() }),
        );
        $('#galpi_save_state').text('저장됨');
    } catch (error) {
        console.error('[갈피] 저장 실패:', error);
        $('#galpi_save_state').text('저장 실패');
    }
}

function scheduleChatSave() {
    if (!ensureGlobalSettings().autoSave || !currentChatKey) {
        $('#galpi_save_state').text('수정됨');
        return;
    }

    clearTimeout(saveTimer);
    $('#galpi_save_state').text('저장 중…');
    saveTimer = setTimeout(saveCurrentChat, 400);
}

function createSettingsPanel() {
    if ($('#galpi_settings').length) return;

    const target = $('#extensions_settings2');
    if (!target.length) {
        console.warn('[갈피] 확장 설정 영역을 찾지 못했습니다.');
        return;
    }

    target.append(`
        <div id="galpi_settings" class="galpi-settings extension_container">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>📖 갈피</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <p class="galpi-muted">
                        모든 채팅방에 공통으로 적용되는 기본 설정입니다.
                        카드와 메모는 채팅방별로 따로 저장됩니다.
                    </p>

                    <label for="galpi_setting_scope">기본 분석 범위</label>
                    <select id="galpi_setting_scope" class="text_pole">
                        <option value="recent">최근 메시지</option>
                        <option value="summaryRecent">요약 + 최근 메시지</option>
                        <option value="custom">사용자 선택</option>
                    </select>

                    <label for="galpi_setting_recent">최근 메시지 수</label>
                    <input id="galpi_setting_recent" class="text_pole"
                        type="number" min="2" max="200" step="1">

                    <label for="galpi_setting_injection">기본 주입 방식</label>
                    <select id="galpi_setting_injection" class="text_pole">
                        <option value="oneShot">이번 응답에만</option>
                        <option value="persistent">지속 주입</option>
                        <option value="background">배경 방향</option>
                    </select>

                    <label class="galpi-switch-row">
                        <span>채팅별 데이터 자동 저장</span>
                        <input id="galpi_setting_autosave" type="checkbox">
                    </label>
                </div>
            </div>
        </div>
    `);

    const settings = ensureGlobalSettings();
    $('#galpi_setting_scope').val(settings.analysisScope);
    $('#galpi_setting_recent').val(settings.recentMessageCount);
    $('#galpi_setting_injection').val(settings.defaultInjectionMode);
    $('#galpi_setting_autosave').prop('checked', settings.autoSave);

    $('#galpi_setting_scope').on('change', function () {
        settings.analysisScope = $(this).val();
        saveSettingsDebounced();
    });

    $('#galpi_setting_recent').on('change', function () {
        settings.recentMessageCount = Math.max(2, Math.min(200, Number($(this).val()) || 20));
        $(this).val(settings.recentMessageCount);
        saveSettingsDebounced();
    });

    $('#galpi_setting_injection').on('change', function () {
        settings.defaultInjectionMode = $(this).val();
        saveSettingsDebounced();
    });

    $('#galpi_setting_autosave').on('change', function () {
        settings.autoSave = this.checked;
        saveSettingsDebounced();
    });
}

function addMenuItem() {
    if (document.querySelector('#galpi_menu_item')) return true;

    const menu = document.querySelector('#extensionsMenu');
    if (!menu) return false;

    const item = document.createElement('div');
    item.id = 'galpi_menu_item';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.innerHTML = `
        <i class="fa-solid fa-book-open"></i>
        <span>갈피</span>
    `;
    menu.appendChild(item);
    return true;
}

function ensureMenuItem() {
    if (addMenuItem()) return;

    const observer = new MutationObserver(() => {
        if (addMenuItem()) observer.disconnect();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => observer.disconnect(), 30000);
}

function createModal() {
    if (document.querySelector('#galpi_modal_overlay')) return;

    document.body.insertAdjacentHTML('beforeend', `
        <div id="galpi_modal_overlay" class="galpi-modal-overlay" aria-hidden="true">
            <section class="galpi-modal" role="dialog" aria-modal="true">
                <header class="galpi-modal-header">
                    <div class="galpi-brand-mark">📖</div>
                    <div class="galpi-modal-heading">
                        <h2>갈피</h2>
                        <div id="galpi_chat_name" class="galpi-chat-name">현재 채팅</div>
                    </div>
                    <button id="galpi_modal_close" class="galpi-icon-button" type="button">×</button>
                </header>

                <nav class="galpi-modal-tabs">
                    <button class="galpi-modal-tab active" data-tab="advisor" type="button">전개 상담</button>
                    <button class="galpi-modal-tab" data-tab="cards" type="button">스토리보드</button>
                    <button class="galpi-modal-tab" data-tab="inject" type="button">주입</button>
                    <button class="galpi-modal-tab" data-tab="preview" type="button">미리보기</button>
                </nav>

                <main class="galpi-modal-body">
                    <section class="galpi-tab-view active" data-view="advisor">
                        <div class="galpi-section-title">이 채팅의 작업 메모</div>
                        <p class="galpi-muted">채팅별 저장 구조를 확인하기 위한 테스트 메모입니다.</p>
                        <textarea id="galpi_chat_memo" class="text_pole galpi-main-textarea"
                            placeholder="예: 현재는 슬로우번 유지. 고백 금지."></textarea>
                    </section>

                    <section class="galpi-tab-view" data-view="cards">
                        <div class="galpi-board-header">
                            <div>
                                <div class="galpi-section-title">스토리보드</div>
                                <div id="galpi_card_count" class="galpi-muted">0개의 카드</div>
                            </div>
                            <button id="galpi_add_card" class="menu_button" type="button">+ 새 카드</button>
                        </div>
                        <div id="galpi_card_list" class="galpi-card-list"></div>
                    </section>

                    <section class="galpi-tab-view" data-view="inject">
                        <div class="galpi-empty-state">
                            <div class="galpi-empty-icon">🧷</div>
                            <b>주입 기능은 다음 단계에서 연결합니다.</b>
                        </div>
                    </section>

                    <section class="galpi-tab-view" data-view="preview">
                        <div class="galpi-empty-state">
                            <div class="galpi-empty-icon">🔎</div>
                            <b>미리보기 기능은 다음 단계에서 연결합니다.</b>
                        </div>
                    </section>
                </main>

                <footer class="galpi-modal-footer">
                    <div id="galpi_save_state" class="galpi-save-state">저장됨</div>
                    <button id="galpi_manual_save" class="menu_button" type="button">저장</button>
                </footer>
            </section>
        </div>
    `);
}

function renderCards(cards = []) {
    const list = document.querySelector('#galpi_card_list');
    if (!list) return;

    if (!cards.length) {
        list.innerHTML = `
            <div class="galpi-empty-state galpi-small-empty">
                <div class="galpi-empty-icon">🗂️</div>
                <b>아직 저장된 카드가 없습니다.</b>
            </div>
        `;
    } else {
        list.innerHTML = cards.map(card => `
            <article class="galpi-card" data-id="${escapeHtml(card.id)}">
                <input class="text_pole galpi-card-title"
                    value="${escapeHtml(card.title)}" placeholder="카드 제목">
                <textarea class="text_pole galpi-card-content"
                    placeholder="가능한 전개를 적으세요.">${escapeHtml(card.content)}</textarea>
                <button class="menu_button galpi-delete-card" type="button">삭제</button>
            </article>
        `).join('');
    }

    $('#galpi_card_count').text(`${list.querySelectorAll('.galpi-card').length}개의 카드`);
}

function switchTab(tab) {
    document.querySelectorAll('.galpi-modal-tab').forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === tab);
    });

    document.querySelectorAll('.galpi-tab-view').forEach((view) => {
        view.classList.toggle('active', view.dataset.view === tab);
    });
}

function openGalpiModal() {
    createModal();

    const identity = getChatIdentity();
    currentChatKey = identity.key;
    const data = loadChatData(currentChatKey);

    $('#galpi_chat_name').text(identity.name);
    $('#galpi_chat_memo').val(data.memo || '');
    renderCards(data.cards || []);
    switchTab(data.activeTab || 'advisor');
    $('#galpi_save_state').text('저장됨');

    const overlay = document.querySelector('#galpi_modal_overlay');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('galpi-modal-open');

    console.log('[갈피] 모달 열기 성공');
}

function closeGalpiModal() {
    saveCurrentChat();
    document.querySelector('#galpi_modal_overlay')?.classList.remove('open');
    document.querySelector('#galpi_modal_overlay')?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('galpi-modal-open');
}

function bindNativeMenuCapture() {
    // SillyTavern 메뉴 자체의 클릭 처리보다 먼저 실행하기 위해 capture=true 사용
    document.addEventListener('pointerdown', (event) => {
        const item = event.target.closest?.('#galpi_menu_item');
        if (!item) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openGalpiModal();
    }, true);

    // 키보드 접근
    document.addEventListener('keydown', (event) => {
        const item = event.target.closest?.('#galpi_menu_item');
        if (!item || !['Enter', ' '].includes(event.key)) return;

        event.preventDefault();
        event.stopPropagation();
        openGalpiModal();
    }, true);
}

function bindModalEvents() {
    document.addEventListener('click', (event) => {
        if (event.target.closest('#galpi_modal_close')) {
            closeGalpiModal();
            return;
        }

        if (event.target.id === 'galpi_modal_overlay') {
            closeGalpiModal();
            return;
        }

        const tab = event.target.closest('.galpi-modal-tab');
        if (tab) {
            switchTab(tab.dataset.tab);
            scheduleChatSave();
            return;
        }

        if (event.target.closest('#galpi_add_card')) {
            const data = collectCurrentChatData();
            data.cards.push({
                id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                title: '새 전개 카드',
                content: '',
            });
            renderCards(data.cards);
            scheduleChatSave();
            return;
        }

        const deleteButton = event.target.closest('.galpi-delete-card');
        if (deleteButton) {
            deleteButton.closest('.galpi-card')?.remove();
            const data = collectCurrentChatData();
            renderCards(data.cards);
            scheduleChatSave();
            return;
        }

        if (event.target.closest('#galpi_manual_save')) {
            saveCurrentChat();
        }
    });

    document.addEventListener('input', (event) => {
        if (event.target.matches('#galpi_chat_memo, .galpi-card-title, .galpi-card-content')) {
            scheduleChatSave();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && document.querySelector('#galpi_modal_overlay.open')) {
            closeGalpiModal();
        }
    });
}

jQuery(async () => {
    ensureGlobalSettings();
    createSettingsPanel();
    createModal();
    ensureMenuItem();
    bindNativeMenuCapture();
    bindModalEvents();

    console.log('[갈피] v0.0.4 로드 완료');
});