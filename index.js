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

function ensureGlobalSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    }
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (extension_settings[MODULE_NAME][key] === undefined) {
            extension_settings[MODULE_NAME][key] = structuredClone(value);
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
    const chatId = context.chatId ?? context.chat_id ?? 'no-chat';
    const name = context.name2 || context.characterName || context.characters?.[characterId]?.name || '현재 채팅';
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

function saveChatData(chatKey, data) {
    try {
        localStorage.setItem(storageKey(chatKey), JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
        $('#galpi_save_state').text('저장됨');
    } catch (error) {
        console.error('[갈피] 채팅 데이터 저장 실패:', error);
        $('#galpi_save_state').text('저장 실패');
    }
}

function collectCurrentChatData() {
    const cards = [];
    $('#galpi_card_list .galpi-card').each(function () {
        cards.push({
            id: String($(this).data('id')),
            title: $(this).find('.galpi-card-title').val() || '',
            content: $(this).find('.galpi-card-content').val() || '',
        });
    });
    return {
        memo: $('#galpi_chat_memo').val() || '',
        cards,
        activeTab: $('.galpi-modal-tab.active').data('tab') || 'advisor',
    };
}

function saveCurrentChat() {
    if (currentChatKey) saveChatData(currentChatKey, collectCurrentChatData());
}

function scheduleChatSave() {
    if (!ensureGlobalSettings().autoSave) {
        $('#galpi_save_state').text('수정됨');
        return;
    }
    clearTimeout(saveTimer);
    $('#galpi_save_state').text('저장 중…');
    saveTimer = setTimeout(saveCurrentChat, 450);
}

function createSettingsPanel() {
    if ($('#galpi_settings').length) return;
    const html = `
    <div id="galpi_settings" class="galpi-settings extension_container">
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>📖 갈피</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
          <p class="galpi-muted">모든 채팅방에 공통으로 적용되는 기본 설정입니다. 카드와 메모는 채팅방별로 따로 저장됩니다.</p>
          <label>기본 분석 범위</label>
          <select id="galpi_setting_scope" class="text_pole">
            <option value="recent">최근 메시지</option>
            <option value="summaryRecent">요약 + 최근 메시지</option>
            <option value="custom">사용자 선택</option>
          </select>
          <label>최근 메시지 수</label>
          <input id="galpi_setting_recent" class="text_pole" type="number" min="2" max="200" step="1">
          <label>기본 주입 방식</label>
          <select id="galpi_setting_injection" class="text_pole">
            <option value="oneShot">이번 응답에만</option>
            <option value="persistent">지속 주입</option>
            <option value="background">배경 방향</option>
          </select>
          <label class="galpi-switch-row"><span>채팅별 데이터 자동 저장</span><input id="galpi_setting_autosave" type="checkbox"></label>
          <button id="galpi_open_from_settings" class="menu_button">현재 채팅의 갈피 열기</button>
        </div>
      </div>
    </div>`;
    const target = $('#extensions_settings2');
    if (target.length) target.append(html);
    const s = ensureGlobalSettings();
    $('#galpi_setting_scope').val(s.analysisScope);
    $('#galpi_setting_recent').val(s.recentMessageCount);
    $('#galpi_setting_injection').val(s.defaultInjectionMode);
    $('#galpi_setting_autosave').prop('checked', s.autoSave);

    $('#galpi_setting_scope').on('change', function(){ s.analysisScope = $(this).val(); saveSettingsDebounced(); });
    $('#galpi_setting_recent').on('change', function(){ s.recentMessageCount = Number($(this).val()) || 20; saveSettingsDebounced(); });
    $('#galpi_setting_injection').on('change', function(){ s.defaultInjectionMode = $(this).val(); saveSettingsDebounced(); });
    $('#galpi_setting_autosave').on('change', function(){ s.autoSave = this.checked; saveSettingsDebounced(); });
    $('#galpi_open_from_settings').on('click', openGalpiModal);
}

function createMenuLauncher() {
    if ($('#galpi_menu_item').length) return true;
    const menu = $('#extensionsMenu');
    if (!menu.length) return false;
    menu.append(`<div id="galpi_menu_item" class="list-group-item flex-container flexGap5 interactable" tabindex="0"><i class="fa-solid fa-book-open"></i><span>갈피</span></div>`);
    return true;
}

function ensureMenuLauncher() {
    if (createMenuLauncher()) return;
    let attempts = 0;
    const timer = setInterval(() => {
        attempts++;
        if (createMenuLauncher() || attempts > 40) clearInterval(timer);
    }, 500);
}

function createModal() {
    if ($('#galpi_modal_overlay').length) return;
    $('body').append(`
    <div id="galpi_modal_overlay" class="galpi-modal-overlay" aria-hidden="true">
      <section class="galpi-modal" role="dialog" aria-modal="true">
        <header class="galpi-modal-header">
          <div class="galpi-brand-mark">📖</div>
          <div class="galpi-modal-heading"><h2>갈피</h2><div id="galpi_chat_name" class="galpi-chat-name">현재 채팅</div></div>
          <button id="galpi_modal_close" class="galpi-icon-button">×</button>
        </header>
        <nav class="galpi-modal-tabs">
          <button class="galpi-modal-tab active" data-tab="advisor">전개 상담</button>
          <button class="galpi-modal-tab" data-tab="cards">스토리보드</button>
          <button class="galpi-modal-tab" data-tab="inject">주입</button>
          <button class="galpi-modal-tab" data-tab="preview">미리보기</button>
        </nav>
        <main class="galpi-modal-body">
          <section class="galpi-tab-view active" data-view="advisor">
            <div class="galpi-section-title">이 채팅의 작업 메모</div>
            <p class="galpi-muted">채팅별 저장 구조를 확인하기 위한 테스트 메모입니다.</p>
            <textarea id="galpi_chat_memo" class="text_pole galpi-main-textarea" placeholder="예: 슬로우번 유지. 고백 금지. 다음에는 일상 에피소드가 필요함."></textarea>
          </section>
          <section class="galpi-tab-view" data-view="cards">
            <div class="galpi-board-header"><div><div class="galpi-section-title">스토리보드</div><div id="galpi_card_count" class="galpi-muted">0개의 카드</div></div><button id="galpi_add_card" class="menu_button">+ 새 카드</button></div>
            <div id="galpi_card_list" class="galpi-card-list"></div>
          </section>
          <section class="galpi-tab-view" data-view="inject"><div class="galpi-empty-state"><div class="galpi-empty-icon">🧷</div><b>주입 기능은 다음 단계에서 연결합니다.</b><span>이번 버전에서는 창 구조와 채팅별 저장을 먼저 검증합니다.</span></div></section>
          <section class="galpi-tab-view" data-view="preview"><div class="galpi-empty-state"><div class="galpi-empty-icon">🔎</div><b>프롬프트 미리보기는 다음 단계에서 연결합니다.</b><span>스토리 카드 저장을 먼저 검증합니다.</span></div></section>
        </main>
        <footer class="galpi-modal-footer"><div id="galpi_save_state" class="galpi-save-state">저장됨</div><button id="galpi_manual_save" class="menu_button">저장</button><button class="menu_button galpi-primary" disabled>주입 적용</button></footer>
      </section>
    </div>`);

    $('#galpi_modal_close').on('click', closeGalpiModal);
    $('#galpi_modal_overlay').on('click', function(e){ if (e.target === this) closeGalpiModal(); });
    $('.galpi-modal-tab').on('click', function(){ switchTab($(this).data('tab')); scheduleChatSave(); });
    $('#galpi_chat_memo').on('input', scheduleChatSave);
    $('#galpi_manual_save').on('click', saveCurrentChat);
    $('#galpi_add_card').on('click', function(){
        const data = collectCurrentChatData();
        data.cards.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, title: '새 전개 카드', content: '' });
        renderCards(data.cards);
        scheduleChatSave();
    });
    $('#galpi_card_list').on('input', '.galpi-card-title, .galpi-card-content', scheduleChatSave);
    $('#galpi_card_list').on('click', '.galpi-delete-card', function(){
        $(this).closest('.galpi-card').remove();
        if (!$('#galpi_card_list .galpi-card').length) renderCards([]); else updateCardCount();
        scheduleChatSave();
    });
}

function switchTab(tab) {
    $('.galpi-modal-tab').removeClass('active');
    $(`.galpi-modal-tab[data-tab="${tab}"]`).addClass('active');
    $('.galpi-tab-view').removeClass('active');
    $(`.galpi-tab-view[data-view="${tab}"]`).addClass('active');
}

function renderCards(cards = []) {
    const list = $('#galpi_card_list');
    if (!cards.length) {
        list.html(`<div class="galpi-empty-state galpi-small-empty"><div class="galpi-empty-icon">🗂️</div><b>아직 저장된 카드가 없습니다.</b><span>새 카드를 만들어 전개 아이디어를 적어보세요.</span></div>`);
    } else {
        list.html(cards.map(card => `<article class="galpi-card" data-id="${escapeHtml(card.id)}"><input class="text_pole galpi-card-title" value="${escapeHtml(card.title)}" placeholder="카드 제목"><textarea class="text_pole galpi-card-content" placeholder="가능한 전개, 목적, 피하고 싶은 요소 등을 적으세요.">${escapeHtml(card.content)}</textarea><button class="menu_button galpi-delete-card">삭제</button></article>`).join(''));
    }
    updateCardCount();
}

function updateCardCount() {
    $('#galpi_card_count').text(`${$('#galpi_card_list .galpi-card').length}개의 카드`);
}

function openGalpiModal() {
    createModal();
    const identity = getChatIdentity();
    currentChatKey = identity.key;
    const data = loadChatData(currentChatKey);
    $('#galpi_chat_name').text(identity.name);
    $('#galpi_chat_memo').val(data.memo);
    renderCards(data.cards || []);
    switchTab(data.activeTab || 'advisor');
    $('#galpi_save_state').text('저장됨');
    $('#galpi_modal_overlay').addClass('open').attr('aria-hidden', 'false');
    document.body.classList.add('galpi-modal-open');
}

function closeGalpiModal() {
    saveCurrentChat();
    $('#galpi_modal_overlay').removeClass('open').attr('aria-hidden', 'true');
    document.body.classList.remove('galpi-modal-open');
}

jQuery(() => {
    ensureGlobalSettings();
    createSettingsPanel();
    ensureMenuLauncher();
    createModal();
    $(document).on('click', '#galpi_menu_item', openGalpiModal);
    console.log('[갈피] v0.0.2 로드 완료');
});
