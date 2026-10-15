<template>
    <Detail :title="t('panel.prompt.section')">
        <Field :label="t('panel.prompt.jailbreakStrategy')">
            <template #label-suffix>
                <HelpIcon :help="prompt_break_help" />
            </template>
            <Select
                v-model="store.settings.追加モデル解析設定.脱獄方案"
                :options="jailbreak_options"
            />
        </Field>

        <Field
            v-if="store.settings.追加モデル解析設定.脱獄方案 === 'その他のプリセットを使用'"
            :label="t('panel.prompt.targetPreset')"
        >
            <Select
                v-if="available_preset_names.length > 0"
                v-model="store.settings.追加モデル解析設定.その他プリセット名"
                :options="available_preset_names"
            />
            <input
                v-else
                class="text_pole"
                type="text"
                disabled
                :value="t('panel.prompt.noSavedPreset')"
            />
        </Field>

        <Field
            v-if="store.settings.追加モデル解析設定.脱獄方案 === '内蔵脱獄を使用'"
            :label="t('panel.prompt.randomHeader')"
        >
            <template #label-suffix>
                <HelpIcon :help="t('panel.prompt.randomHeaderHelp')" />
            </template>
            <Checkbox v-model="store.settings.追加モデル解析設定.ランダムヘッダー">
                <span>{{ t('panel.prompt.randomHeader') }}</span>
            </Checkbox>
        </Field>

        <Field :label="t('panel.prompt.responseFormat')">
            <template #label-suffix>
                <HelpIcon :help="prompt_toolcall_help" />
            </template>
            <Select
                v-model="store.settings.追加モデル解析設定.応答フォーマット"
                :options="response_format_options"
            />
        </Field>

        <Field
            v-if="store.settings.追加モデル解析設定.応答フォーマット === 'フォーマット出力(v4互換)'"
            :label="t('panel.prompt.disableThinking')"
        >
            <template #label-suffix>
                <HelpIcon :help="t('panel.prompt.disableThinkingHelp')" />
            </template>
            <Checkbox v-model="store.settings.追加モデル解析設定.thinking無効">
                <span>{{ t('panel.prompt.disable') }}</span>
            </Checkbox>
        </Field>

        <Field :label="t('panel.prompt.fakeStreaming')">
            <template #label-suffix>
                <HelpIcon :help="t('panel.prompt.fakeStreamingHelp')" />
            </template>
            <Checkbox v-model="store.settings.追加モデル解析設定.疑似ストリーミング互換">
                <span>{{ t('common.enabled') }}</span>
            </Checkbox>
        </Field>

        <Field :label="t('panel.prompt.whitelist')">
            <template #label-suffix>
                <HelpIcon
                    :help="
                        t('panel.prompt.whitelistHelp', {
                            example: t('panel.prompt.whitelistPlaceholder', { or: '|' }),
                        })
                    "
                />
                <OverrideBadge v-if="has_active_character_whitelist" kind="additive" />
            </template>
            <input
                v-model="store.settings.追加モデル解析設定.ワールドブックエントリホワイトリスト正規表現"
                type="text"
                class="text_pole"
                :placeholder="t('panel.prompt.whitelistPlaceholder', { or: '|' })"
            />
            <div v-if="whitelist_regex_error" class="mvu-regex-error">
                {{ whitelist_regex_error }}
            </div>
        </Field>

        <Field :label="t('panel.prompt.blacklist')">
            <template #label-suffix>
                <HelpIcon
                    :help="
                        t('panel.prompt.blacklistHelp', {
                            example: t('panel.prompt.blacklistPlaceholder', { or: '|' }),
                        })
                    "
                />
                <OverrideBadge v-if="has_active_character_blacklist" kind="additive" />
            </template>
            <input
                v-model="store.settings.追加モデル解析設定.ワールドブックエントリブラックリスト正規表現"
                type="text"
                class="text_pole"
                :placeholder="t('panel.prompt.blacklistPlaceholder', { or: '|' })"
            />
            <div v-if="blacklist_regex_error" class="mvu-regex-error">
                {{ blacklist_regex_error }}
            </div>
        </Field>

        <div class="mvu-regex-actions">
            <input
                class="mvu-regex-actions__button menu_button menu_button_icon interactable"
                type="button"
                :value="t('panel.prompt.filtered.title')"
                @click="showLastFilteredEntriesPopup"
            />
        </div>
    </Detail>
</template>

<script setup lang="ts">
import { compileEntryCommentRegex } from '@/function/request/entry_comment_regex';
import { getFunctionCallingApiVersionUnsupportedMessage } from '@/function/is_function_calling_supported';
import { getAvailableExtraModelPresetNames } from '@/function/update/extra_model_preset';
import { useMvuI18n } from '@/i18n';
import Checkbox from '@/panel/component/Checkbox.vue';
import Detail from '@/panel/component/Detail.vue';
import Field from '@/panel/component/Field.vue';
import OverrideBadge from '@/panel/component/OverrideBadge.vue';
import Select from '@/panel/component/Select.vue';
import prompt_break_help_en from '@/panel/update/prompt_break.en.md';
import prompt_break_help_zh_cn from '@/panel/update/prompt_break.zh-CN.md';
import prompt_toolcall_help_en from '@/panel/update/prompt_toolcall.en.md';
import prompt_toolcall_help_zh_cn from '@/panel/update/prompt_toolcall.zh-CN.md';
import { EXTRA_MODEL_RESPONSE_FORMATS, useDataStore } from '@/store';
import { computed, watch } from 'vue';
import HelpIcon from '../component/HelpIcon.vue';

const store = useDataStore();
const { locale, t } = useMvuI18n();
const available_preset_names = computed(() => getAvailableExtraModelPresetNames());
const prompt_break_help = computed(() =>
    locale.value === 'zh-CN' ? prompt_break_help_zh_cn : prompt_break_help_en
);
const prompt_toolcall_help = computed(() =>
    locale.value === 'zh-CN' ? prompt_toolcall_help_zh_cn : prompt_toolcall_help_en
);
const jailbreak_options = computed(() => [
    { value: "内蔵脱獄を使用", label: t('panel.prompt.jailbreak.builtin') },
    { value: "現在のプリセットを使用", label: t('panel.prompt.jailbreak.currentPreset') },
    { value: "その他のプリセットを使用", label: t('panel.prompt.jailbreak.otherPreset') },
]);
const response_format_options = computed(() =>
    EXTRA_MODEL_RESPONSE_FORMATS.map(value => ({
        value,
        label: {
            チャットメッセージ: t('panel.prompt.response.chatMessage'),
            ツール呼び出し: t('panel.prompt.response.toolCall'),
            フォーマット出力: t('panel.prompt.response.structured'),
            "フォーマット出力(v4互換)": t('panel.prompt.response.structuredV4'),
        }[value],
    }))
);

function getRegexError(value: string) {
    const error = compileEntryCommentRegex(value).error;
    return error ? t('panel.prompt.regexInvalid', { error }) : '';
}

const whitelist_regex_error = computed(() =>
    getRegexError(store.settings.追加モデル解析設定.ワールドブックエントリホワイトリスト正規表現)
);
const blacklist_regex_error = computed(() =>
    getRegexError(store.settings.追加モデル解析設定.ワールドブックエントリブラックリスト正規表現)
);
const has_active_character_whitelist = computed(() => {
    const value = store.get_character_settings_override("追加モデル解析設定.ワールドブックエントリホワイトリスト正規表現");
    return typeof value === 'string' && compileEntryCommentRegex(value).regex !== undefined;
});
const has_active_character_blacklist = computed(() => {
    const value = store.get_character_settings_override("追加モデル解析設定.ワールドブックエントリブラックリスト正規表現");
    return typeof value === 'string' && compileEntryCommentRegex(value).regex !== undefined;
});

function ensureValidPresetSelection() {
    if (store.settings.追加モデル解析設定.脱獄方案 !== "その他のプリセットを使用") {
        return;
    }

    if (available_preset_names.value.length === 0) {
        store.settings.追加モデル解析設定.その他プリセット名 = '';
        return;
    }

    if (!available_preset_names.value.includes(store.settings.追加モデル解析設定.その他プリセット名)) {
        [store.settings.追加モデル解析設定.その他プリセット名] = available_preset_names.value;
    }
}

function showLastFilteredEntriesPopup() {
    const result = store.runtimes.前回の世界書エントリー選別結果;
    const content = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = t('panel.prompt.filtered.title');
    content.append(heading);

    if (result.length === 0) {
        const empty_message = document.createElement('p');
        empty_message.textContent = t('panel.prompt.filtered.empty');
        content.append(empty_message);
    } else {
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';

        const header_row = document.createElement('tr');
        [
            t('panel.prompt.filtered.entrySource'),
            t('panel.prompt.filtered.worldBook'),
            t('panel.prompt.filtered.reason'),
            t('panel.prompt.filtered.configSource'),
            t('panel.prompt.filtered.comment'),
        ].forEach(label => appendTableCell(header_row, label, true));

        const table_head = document.createElement('thead');
        table_head.append(header_row);
        table.append(table_head);

        const table_body = document.createElement('tbody');
        result.forEach(entry => {
            const row = document.createElement('tr');
            appendTableCell(row, getLoreLabel(entry.lore));
            appendTableCell(row, entry.world);
            appendTableCell(row, getReasonLabel(entry.reason));
            appendTableCell(row, getFilterSources(entry));
            appendTableCell(row, entry.comment, false, true);
            table_body.append(row);
        });
        table.append(table_body);
        content.append(table);
    }

    SillyTavern.callGenericPopup(content.outerHTML, SillyTavern.POPUP_TYPE.TEXT, '', {
        allowVerticalScrolling: true,
        leftAlign: true,
        wide: true,
    });
}

function appendTableCell(
    row: HTMLTableRowElement,
    value: string,
    is_header = false,
    break_word = false
) {
    const cell = document.createElement(is_header ? 'th' : 'td');
    cell.textContent = value;
    cell.style.textAlign = 'left';
    cell.style.padding = '0.35rem';
    if (is_header) {
        cell.style.borderBottom = '1px solid currentColor';
    } else {
        cell.style.verticalAlign = 'top';
    }
    if (break_word) {
        cell.style.wordBreak = 'break-word';
    }
    row.append(cell);
}

function getLoreLabel(lore: string): string {
    const labels = {
        globalLore: t('panel.prompt.filtered.globalLore'),
        characterLore: t('panel.prompt.filtered.characterLore'),
        chatLore: t('panel.prompt.filtered.chatLore'),
        personaLore: t('panel.prompt.filtered.personaLore'),
    };
    return labels[lore as keyof typeof labels] ?? lore;
}

function getReasonLabel(reason: string): string {
    return reason === "許可リスト"
        ? t('panel.prompt.filtered.whitelistReason')
        : reason === "拒否リスト"
          ? t('panel.prompt.filtered.blacklistReason')
          : reason;
}

function getFilterSources(entry: unknown): string {
    const sources = _.get(entry, 'sources');
    if (!Array.isArray(sources)) {
        return '—';
    }
    const labels = sources
        .filter((source): source is string => typeof source === 'string')
        .map(source => {
            if (source === "ユーザー共通設定") {
                return t('panel.prompt.filtered.globalConfig');
            }
            if (source === "キャラクターカード設定") {
                return t('panel.prompt.filtered.characterConfig');
            }
            return source;
        });
    return labels.length > 0 ? labels.join(locale.value === 'zh-CN' ? '、' : ', ') : '—';
}

watch(available_preset_names, ensureValidPresetSelection, { immediate: true });
watch(
    () => store.settings.追加モデル解析設定.脱獄方案,
    () => ensureValidPresetSelection(),
    { immediate: true }
);

watch(
    () =>
        [
            store.settings.追加モデル解析設定.応答フォーマット,
            store.settings.追加モデル解析設定.モデル出典,
        ] as const,
    ([value, model_source]) => {
        if (value === "ツール呼び出し") {
            const version_message = getFunctionCallingApiVersionUnsupportedMessage();
            if (version_message) {
                toastr.error(version_message, t('panel.prompt.toolCallUnavailableTitle'), {
                    timeOut: 5000,
                });
                store.settings.追加モデル解析設定.応答フォーマット = "チャットメッセージ";
                return;
            }
            if (!SillyTavern.ToolManager.isToolCallingSupported()) {
                toastr.error(
                    t('panel.prompt.toolCallUnsupported'),
                    t('panel.prompt.toolCallUnavailableTitle'),
                    {
                        timeOut: 5000,
                    }
                );
                store.settings.追加モデル解析設定.応答フォーマット = "チャットメッセージ";
                return;
            }
        }
        if (value === "フォーマット出力(v4互換)" && model_source === "プラグと同じ") {
            toastr.error(
                t('panel.prompt.structuredV4RequiresCustom'),
                t('panel.prompt.structuredV4UnavailableTitle'),
                {
                    timeOut: 5000,
                }
            );
            store.settings.追加モデル解析設定.応答フォーマット = "チャットメッセージ";
        }
    }
);
</script>

<style scoped>
.mvu-regex-error {
    color: var(--SmartThemeQuoteColor, #ff6b6b);
    font-size: calc(var(--mainFontSize, 1rem) * 0.9);
    line-height: 1.35;
    word-break: break-word;
}

.mvu-regex-actions {
    display: flex;
    padding: 0 0.6rem 0.45rem;
}

.mvu-regex-actions__button {
    min-height: 2rem;
    white-space: normal;
}
</style>
