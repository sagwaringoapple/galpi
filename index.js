import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';

const MODULE_NAME = 'galpi';

const DEFAULT_SETTINGS = {
    recentMessageCount: 20,
    advisorQuestion: '',
    advisorOutput: '',
    cards: [],
    oneShotCardIds: [],
    persistentCardIds: [],
};

function ensureSettings() {
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

function uid() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function buildPanel() {
    return `
        <div id="galpi_panel" class="galpi-panel">
            <div class="galpi-header">
                <div>
                    <div class="galpi-title">갈피</div>
                    <div class="galpi-subtitle">장기 롤플 전개 상담과 스토리보드</div>
                </div>
                <button id="galpi_close" class="menu_button">닫기</button>
            </div>

            <div class="galpi-tabs">
                <button class="menu_button galpi-tab active" data-tab="advisor">전개 상담</button>
                <button class="menu_button galpi-tab" data-tab="board">스토리보드</button>
                <button class="menu_button galpi-tab" data-tab="inject">주입</button>
                <button class="menu_button galpi-tab" data-tab="preview">미리보기</button>
            </div>

            <section class="galpi-view active" data-view="advisor">
                <label class="galpi-label" for="galpi_recent_count">불러올 최근 메시지 수</label>
                <input id="galpi_recent_count" class="text_pole" type="number" min="2" max="100" step="1">

                <label class="galpi-label" for="galpi_question">AI에게 묻고 싶은 내용</label>
                <textarea id="galpi_question" class="text_pole galpi-textarea"
                    placeholder="예: 현재 흐름을 유지하면서 가능한 다음 전개를 5가지 추천해줘. 고백이나 급격한 관계 진전은 피하고 싶어."></textarea>

                <div class="galpi-actions">
                    <button id="galpi_load_context" class="menu_button">현재 롤플 가져오기</button>
                    <button id="galpi_make_prompt" class="menu_button">상담 프롬프트 만들기</button>
                </div>

                <label class="galpi-label" for="galpi_advisor_prompt">상담용 프롬프트</label>
                <textarea id="galpi_advisor_prompt" class="text_pole galpi-textarea galpi-large"
                    readonly placeholder="현재 롤플 일부와 질문을 조합한 프롬프트가 여기에 표시됩니다."></textarea>

                <p class="galpi-note">
                    v0.1에서는 상담 프롬프트를 만들어 현재 사용 중인 AI에 직접 전달하는 구조입니다.
                    AI 응답 자동 수집은 다음 단계에서 연결합니다.
                </p>

                <label class="galpi-label" for="galpi_advisor_output">AI 추천 결과 붙여넣기</label>
                <textarea id="galpi_advisor_output" class="text_pole galpi-textarea"
                    placeholder="AI가 제안한 전개 중 카드로 저장하고 싶은 내용을 붙여넣으세요."></textarea>

                <div class="galpi-actions">
                    <button id="galpi_save_as_card" class="menu_button">스토리보드 카드로 저장</button>
                </div>
            </section>

            <section class="galpi-view" data-view="board">
                <div class="galpi-board-toolbar">
                    <button id="galpi_new_card" class="menu_button">새 카드</button>
                </div>
                <div id="galpi_card_list" class="galpi-card-list"></div>
            </section>

            <section class="galpi-view" data-view="inject">
                <div class="galpi-inject-block">
                    <h3>이번 응답에만 주입</h3>
                    <div id="galpi_one_shot_list"></div>
                </div>
                <div class="galpi-inject-block">
                    <h3>지속 주입</h3>
                    <div id="galpi_persistent_list"></div>
                </div>
                <p class="galpi-note">
                    v0.1에서는 선택 상태와 프롬프트 미리보기까지 저장합니다.
                    실제 생성 프롬프트 자동 삽입은 다음 단계에서 연결합니다.
                </p>
            </section>

            <section class="galpi-view" data-view="preview">
                <label class="galpi-label" for="galpi_preview">현재 주입 프롬프트</label>
                <textarea id="galpi_preview" class="text_pole galpi-textarea galpi-large" readonly></textarea>
                <div class="galpi-actions">
                    <button id="galpi_copy_preview" class="menu_button">복사</button>
                </div>
            </section>
        </div>
    `;
}

function addLauncher() {
    if ($('#galpi_launcher').length) return;

    const launcher = `
        <div id="galpi_launcher" class="list-group-item flex-container flexGap5 interactable" tabindex="0">
            <i class="fa-solid fa-book-open"></i>
            <span>갈피</span>
        </div>
    `;

    const target = $('#extensionsMenu');
    if (target.length) {
        target.append(launcher);
    } else {
        $('body').append(`<button id="galpi_launcher" class="menu_button galpi-floating-launcher">갈피</button>`);
    }
}

function openPanel() {
    if (!$('#galpi_panel').length) {
        $('body').append(buildPanel());
        bindPanelEvents();
    }

    hydratePanel();
    $('#galpi_panel').addClass('open');
}

function closePanel() {
    $('#galpi_panel').removeClass('open');
}

function getRecentMessages(count) {
    const context = getContext();
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const recent = chat.slice(-count);

    return recent.map((message) => {
        const speaker = message.is_user ? 'USER' : (message.name || 'CHARACTER');
        return `[${speaker}]\n${message.mes || ''}`;
    }).join('\n\n');
}

function makeAdvisorPrompt() {
    const settings = ensureSettings();
    const count = Number($('#galpi_recent_count').val()) || settings.recentMessageCount;
    const question = $('#galpi_question').val().trim();
    const contextText = getRecentMessages(count);

    const prompt = [
        '당신은 장기 롤플레이의 전개를 검토하는 스토리 에디터다.',
        '결말을 서두르거나 미래 사건을 확정하지 말고, 현재 흐름에서 자연스럽게 파생될 수 있는 여러 후보를 제안하라.',
        '각 후보는 사용자가 독립적으로 선택·수정·폐기할 수 있어야 한다.',
        '',
        '## 최근 롤플',
        contextText || '(현재 채팅을 불러오지 못했습니다.)',
        '',
        '## 사용자 요청',
        question || '(질문이 입력되지 않았습니다.)',
        '',
        '## 출력 요청',
        '- 현재 흐름의 짧은 진단',
        '- 서로 다른 전개 후보 여러 개',
        '- 각 후보의 장점, 주의점, 사용하기 좋은 시점',
        '- 급전개를 피하기 위한 제안',
    ].join('\n');

    $('#galpi_advisor_prompt').val(prompt);
}

function createCard(data = {}) {
    const settings = ensureSettings();
    const card = {
        id: uid(),
        title: data.title || '새 전개 카드',
        content: data.content || '',
        memo: data.memo || '',
    };

    settings.cards.push(card);
    saveSettingsDebounced();
    renderCards();
    renderInjectionLists();
    updatePreview();
    return card;
}

function updateCard(id, patch) {
    const settings = ensureSettings();
    const card = settings.cards.find((item) => item.id === id);
    if (!card) return;

    Object.assign(card, patch);
    saveSettingsDebounced();
    renderCards();
    renderInjectionLists();
    updatePreview();
}

function deleteCard(id) {
    const settings = ensureSettings();
    settings.cards = settings.cards.filter((item) => item.id !== id);
    settings.oneShotCardIds = settings.oneShotCardIds.filter((item) => item !== id);
    settings.persistentCardIds = settings.persistentCardIds.filter((item) => item !== id);
    saveSettingsDebounced();
    renderCards();
    renderInjectionLists();
    updatePreview();
}

function renderCards() {
    const settings = ensureSettings();
    const container = $('#galpi_card_list');

    if (!settings.cards.length) {
        container.html('<div class="galpi-empty">저장된 카드가 없습니다.</div>');
        return;
    }

    container.html(settings.cards.map((card) => `
        <article class="galpi-card" data-id="${escapeHtml(card.id)}">
            <input class="text_pole galpi-card-title" value="${escapeHtml(card.title)}">
            <textarea class="text_pole galpi-card-content" placeholder="전개 내용">${escapeHtml(card.content)}</textarea>
            <textarea class="text_pole galpi-card-memo" placeholder="메모">${escapeHtml(card.memo)}</textarea>
            <div class="galpi-actions">
                <button class="menu_button galpi-save-card">저장</button>
                <button class="menu_button galpi-delete-card">삭제</button>
            </div>
        </article>
    `).join(''));
}

function renderInjectionLists() {
    const settings = ensureSettings();

    const makeRows = (selectedIds, mode) => settings.cards.map((card) => `
        <label class="galpi-check-row">
            <input type="checkbox" class="galpi-inject-check"
                data-mode="${mode}" data-id="${escapeHtml(card.id)}"
                ${selectedIds.includes(card.id) ? 'checked' : ''}>
            <span>
                <strong>${escapeHtml(card.title)}</strong>
                <small>${escapeHtml(card.content.slice(0, 120))}</small>
            </span>
        </label>
    `).join('') || '<div class="galpi-empty">먼저 스토리보드 카드를 만들어주세요.</div>';

    $('#galpi_one_shot_list').html(makeRows(settings.oneShotCardIds, 'oneShot'));
    $('#galpi_persistent_list').html(makeRows(settings.persistentCardIds, 'persistent'));
}

function buildInjectionPrompt() {
    const settings = ensureSettings();
    const byId = new Map(settings.cards.map((card) => [card.id, card]));

    const persistent = settings.persistentCardIds
        .map((id) => byId.get(id))
        .filter(Boolean);

    const oneShot = settings.oneShotCardIds
        .map((id) => byId.get(id))
        .filter(Boolean);

    const parts = [];

    if (persistent.length) {
        parts.push(
            '[GALPI: 지속 전개 방향]',
            '다음 내용은 당장 완수해야 할 목표가 아니라, 여러 장면에 걸쳐 느슨하게 참고할 전개 방향이다.',
            ...persistent.map((card) => `- ${card.title}: ${card.content}`)
        );
    }

    if (oneShot.length) {
        parts.push(
            '',
            '[GALPI: 이번 응답 참고]',
            '이번 응답에서는 아래 아이디어를 현재 장면의 개연성과 캐릭터성을 해치지 않는 범위에서 참고한다.',
            ...oneShot.map((card) => `- ${card.title}: ${card.content}`)
        );
    }

    return parts.join('\n').trim();
}

function updatePreview() {
    $('#galpi_preview').val(buildInjectionPrompt());
}

function hydratePanel() {
    const settings = ensureSettings();
    $('#galpi_recent_count').val(settings.recentMessageCount);
    $('#galpi_question').val(settings.advisorQuestion);
    $('#galpi_advisor_output').val(settings.advisorOutput);
    renderCards();
    renderInjectionLists();
    updatePreview();
}

function bindPanelEvents() {
    $('#galpi_close').on('click', closePanel);

    $('.galpi-tab').on('click', function () {
        const tab = $(this).data('tab');
        $('.galpi-tab').removeClass('active');
        $(this).addClass('active');
        $('.galpi-view').removeClass('active');
        $(`.galpi-view[data-view="${tab}"]`).addClass('active');
    });

    $('#galpi_recent_count').on('change', function () {
        ensureSettings().recentMessageCount = Number($(this).val()) || 20;
        saveSettingsDebounced();
    });

    $('#galpi_question').on('input', function () {
        ensureSettings().advisorQuestion = $(this).val();
        saveSettingsDebounced();
    });

    $('#galpi_advisor_output').on('input', function () {
        ensureSettings().advisorOutput = $(this).val();
        saveSettingsDebounced();
    });

    $('#galpi_load_context').on('click', function () {
        const count = Number($('#galpi_recent_count').val()) || 20;
        $('#galpi_advisor_prompt').val(getRecentMessages(count));
    });

    $('#galpi_make_prompt').on('click', makeAdvisorPrompt);

    $('#galpi_save_as_card').on('click', function () {
        const content = $('#galpi_advisor_output').val().trim();
        if (!content) return;

        createCard({
            title: content.split('\n').find(Boolean)?.slice(0, 60) || 'AI 추천 전개',
            content,
        });

        $('.galpi-tab[data-tab="board"]').trigger('click');
    });

    $('#galpi_new_card').on('click', function () {
        createCard();
    });

    $('#galpi_card_list').on('click', '.galpi-save-card', function () {
        const cardEl = $(this).closest('.galpi-card');
        updateCard(cardEl.data('id'), {
            title: cardEl.find('.galpi-card-title').val().trim() || '제목 없음',
            content: cardEl.find('.galpi-card-content').val(),
            memo: cardEl.find('.galpi-card-memo').val(),
        });
    });

    $('#galpi_card_list').on('click', '.galpi-delete-card', function () {
        const cardEl = $(this).closest('.galpi-card');
        deleteCard(cardEl.data('id'));
    });

    $('.galpi-panel').on('change', '.galpi-inject-check', function () {
        const settings = ensureSettings();
        const id = $(this).data('id');
        const mode = $(this).data('mode');
        const key = mode === 'oneShot' ? 'oneShotCardIds' : 'persistentCardIds';
        const selected = new Set(settings[key]);

        if (this.checked) selected.add(id);
        else selected.delete(id);

        settings[key] = [...selected];
        saveSettingsDebounced();
        updatePreview();
    });

    $('#galpi_copy_preview').on('click', async function () {
        const text = $('#galpi_preview').val();
        if (!text) return;
        await navigator.clipboard.writeText(text);
    });
}

jQuery(async () => {
    ensureSettings();
    addLauncher();

    $(document).on('click', '#galpi_launcher', openPanel);
});