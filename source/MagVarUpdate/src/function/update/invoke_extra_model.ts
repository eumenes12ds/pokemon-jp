import {
    extractFromFormattedOutput,
    extractFromGenerateToolCallResult,
    MVU_JSON_PATCH_RESPONSE_SCHEMA,
    MVU_TOOL_DEFINITION,
} from '@/function/function_call';
import claude_head from '@/prompts/claude_head.txt?raw';
import claude_tail from '@/prompts/claude_tail.txt?raw';
import extra_model_task from '@/prompts/extra_model_task.txt?raw';
import gemini_head from '@/prompts/gemini_head.txt?raw';
import gemini_tail from '@/prompts/gemini_tail.txt?raw';
import {
    buildOtherPresetGenerateConfig,
    getExtraModelPreset,
} from '@/function/update/extra_model_preset';
import {
    clearExtraModelRequestOverrides,
    setExtraModelRequestOverrides,
} from '@/function/request/extra_model_request_override';
import { tr } from '@/i18n';
import { useDataStore } from '@/store';
import { normalizeBaseURL } from '@/util';
import { literalYamlify, uuidv4 } from '@util/common';
import { compare } from 'compare-versions';
import YAML from 'yaml';

//测试用，为了使首次请求必失败
let debug_extra_request_counter = 0;

const V4_COMPATIBLE_FORMATTED_OUTPUT = "フォーマット出力(v4互換)";
const MIN_CUSTOM_API_BODY_TAVERN_HELPER_VERSION = '4.8.13';
const JSON_OBJECT_CUSTOM_INCLUDE_BODY = Object.freeze({
    response_format: {
        type: 'json_object',
    },
});
const DISABLED_THINKING_CUSTOM_INCLUDE_BODY = Object.freeze({
    thinking: {
        type: 'disabled',
    },
});

function generateRandomHeader(): string {
    return _.times(4, () => uuidv4().slice(0, 8)).join('\n');
}

function isV4CompatibleFormattedOutput(): boolean {
    return useDataStore().settings.追加モデル解析設定.応答フォーマット === V4_COMPATIBLE_FORMATTED_OUTPUT;
}

function supportsCustomApiBody(): boolean {
    const version = useDataStore().versions.tavernhelper;
    return version !== '' && compare(version, MIN_CUSTOM_API_BODY_TAVERN_HELPER_VERSION, '>=');
}

function assertV4CompatibleFormattedOutputUsable() {
    const store = useDataStore();
    if (
        store.settings.追加モデル解析設定.応答フォーマット === V4_COMPATIBLE_FORMATTED_OUTPUT &&
        store.settings.追加モデル解析設定.モデル出典 === "プラグと同じ"
    ) {
        throw new Error(tr('runtime.extraModel.v4RequiresCustomSource'));
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCustomIncludeBody(body: unknown): Record<string, unknown> {
    if (typeof body !== 'string' || body.trim() === '') {
        return {};
    }

    const parsed = YAML.parse(body);
    if (isPlainObject(parsed)) {
        return parsed;
    }
    if (Array.isArray(parsed)) {
        return Object.assign({}, ...parsed.filter(isPlainObject));
    }
    throw new Error(tr('runtime.extraModel.customIncludeBodyInvalid'));
}

function buildJsonObjectCustomIncludeBody(original_body: unknown): Record<string, unknown> {
    const store = useDataStore();
    return {
        ...parseCustomIncludeBody(original_body),
        ...JSON_OBJECT_CUSTOM_INCLUDE_BODY,
        ...(store.settings.追加モデル解析設定.thinking無効
            ? DISABLED_THINKING_CUSTOM_INCLUDE_BODY
            : {}),
    };
}

async function saveSillyTavernSettings() {
    const save_settings =
        typeof builtin === 'undefined' ? undefined : builtin.saveSettings.bind(builtin);
    if (typeof save_settings !== 'function') {
        throw new Error(tr('runtime.extraModel.saveSettingsUnavailable'));
    }
    await save_settings();
}

let temporary_json_object_response_format_state: {
    had_original_body: boolean;
    original_body: unknown;
} | null = null;

async function setTemporaryJsonObjectResponseFormat() {
    if (!isV4CompatibleFormattedOutput() || supportsCustomApiBody()) {
        temporary_json_object_response_format_state = null;
        return;
    }

    assertV4CompatibleFormattedOutputUsable();
    const oai_settings = SillyTavern.chatCompletionSettings;
    if (!isPlainObject(oai_settings)) {
        throw new Error(tr('runtime.extraModel.openAiSettingsUnavailable'));
    }

    const had_original_body = Object.prototype.hasOwnProperty.call(
        oai_settings,
        'custom_include_body'
    );
    const original_body = oai_settings.custom_include_body;
    oai_settings.custom_include_body = YAML.stringify(
        buildJsonObjectCustomIncludeBody(original_body)
    ).trimEnd();
    try {
        await saveSillyTavernSettings();
        temporary_json_object_response_format_state = {
            had_original_body,
            original_body,
        };
    } catch (error) {
        if (had_original_body) {
            oai_settings.custom_include_body = original_body;
        } else {
            delete oai_settings.custom_include_body;
        }
        temporary_json_object_response_format_state = null;
        throw error;
    }
}

async function restoreTemporaryJsonObjectResponseFormat() {
    if (!temporary_json_object_response_format_state) {
        return;
    }

    const oai_settings = SillyTavern.chatCompletionSettings;
    if (!isPlainObject(oai_settings)) {
        throw new Error(tr('runtime.extraModel.openAiSettingsRestoreUnavailable'));
    }

    const { had_original_body, original_body } = temporary_json_object_response_format_state;
    temporary_json_object_response_format_state = null;
    if (had_original_body) {
        oai_settings.custom_include_body = original_body;
    } else {
        delete oai_settings.custom_include_body;
    }
    await saveSillyTavernSettings();
}

async function setExtraAnalysisStates() {
    const store = useDataStore();

    if (store.runtimes.is_during_extra_analysis === true) {
        //这个函数不应当被嵌套调用，因此直接报错
        throw new Error('setExtraAnalysisStates() should not be called recursively.');
    }

    //这里本来也应当初始化macro的，但是因为不知道具体内容，所以延迟到 RequestReply
    //因为这个操作是幂等的，所以无所谓。

    store.runtimes.is_during_extra_analysis = true;
    try {
        await setTemporaryJsonObjectResponseFormat();
    } catch (error) {
        store.runtimes.is_during_extra_analysis = false;
        throw error;
    }
}

async function unsetExtraAnalysisStates() {
    const store = useDataStore();

    SillyTavern.unregisterMacro('lastUserMessage');
    clearExtraModelRequestOverrides();
    store.runtimes.is_function_call_enabled = false;
    try {
        await restoreTemporaryJsonObjectResponseFormat();
    } finally {
        store.runtimes.is_during_extra_analysis = false;
    }
}

let is_analysis_in_progress = false;

export async function invokeExtraModelWithStrategy(): Promise<string | null> {
    const batch_id = generateRandomHeader();
    if (is_analysis_in_progress) {
        return null;
    }
    try {
        is_analysis_in_progress = true;
        const store = useDataStore();

        debug_extra_request_counter = 0;

        const recordedInvoke = async (generation_id?: string) => {
            try {
                return await invokeExtraModel(generation_id, batch_id);
            } catch (e) {
                console.error(e);
                throw e;
            }
        };
        const safeInvoke = async (): Promise<{
            result: string | null;
            is_manual_canceled: boolean;
        }> => {
            let is_manual_canceled = false;
            let did_set_extra_analysis_states = false;
            try {
                await setExtraAnalysisStates();
                did_set_extra_analysis_states = true;
                return { result: await recordedInvoke(), is_manual_canceled: false };
            } catch (e) {
                /** 已经记录, 忽略 */
                if (e === 'Clicked stop button') is_manual_canceled = true;
            } finally {
                if (did_set_extra_analysis_states) {
                    await unsetExtraAnalysisStates();
                }
            }
            return { result: null, is_manual_canceled: is_manual_canceled };
        };
        const concurrentInvoke = async (times: number) => {
            const uuids = _.times(times, uuidv4);
            let did_set_extra_analysis_states = false;
            try {
                await setExtraAnalysisStates();
                did_set_extra_analysis_states = true;
                //在函数调用的模式下，允许接受 **任意** 有效的函数结果，因此被允许被覆盖。
                return await Promise.any(uuids.map(recordedInvoke));
            } catch (e) {
                /** 已经记录, 忽略 */
            } finally {
                uuids.forEach(stopGenerationById);
                if (did_set_extra_analysis_states) {
                    await unsetExtraAnalysisStates();
                }
            }
            return null;
        };

        switch (store.settings.追加モデル解析設定.リクエスト方式) {
            case "順番にリクエストし、失敗したら再試行":
                for (let i = 0; i < store.settings.追加モデル解析設定.リクエスト回数; i++) {
                    if (store.settings.通知.追加モデル解析中) {
                        toastr.info(
                            i === 0
                                ? tr('runtime.extraModel.requesting')
                                : tr('runtime.extraModel.retrying', {
                                      attempt: i,
                                      total: store.settings.追加モデル解析設定.リクエスト回数 - 1,
                                  }),
                            tr('runtime.extraModel.updateInProgressTitle')
                        );
                    }
                    const { result, is_manual_canceled } = await safeInvoke();
                    if (result !== null) {
                        return result;
                    }
                    if (is_manual_canceled) {
                        //因为手动取消了，不再进行重试。
                        return null;
                    }
                }
                return null;
            case "同時に複数回リクエスト":
                if (store.settings.通知.追加モデル解析中) {
                    toastr.info(
                        tr('runtime.extraModel.concurrentRequests', {
                            count: store.settings.追加モデル解析設定.リクエスト回数,
                        }),
                        tr('runtime.extraModel.updateInProgressTitle')
                    );
                }
                return concurrentInvoke(store.settings.追加モデル解析設定.リクエスト回数);
            case "最初に1回リクエストし、失敗したら同時に複数回リクエスト":
                if (store.settings.通知.追加モデル解析中) {
                    toastr.info(
                        tr('runtime.extraModel.firstRequest'),
                        tr('runtime.extraModel.updateInProgressTitle')
                    );
                }
                {
                    const { result, is_manual_canceled } = await safeInvoke();
                    if (result !== null) {
                        return result;
                    }
                    if (is_manual_canceled) {
                        //因为手动取消了，不再进行重试。
                        return null;
                    }
                }
                if (store.settings.通知.追加モデル解析中) {
                    toastr.info(
                        tr('runtime.extraModel.firstRequestFailed', {
                            count: store.settings.追加モデル解析設定.リクエスト回数 - 1,
                        }),
                        tr('runtime.extraModel.updateInProgressTitle')
                    );
                }
                return concurrentInvoke(store.settings.追加モデル解析設定.リクエスト回数 - 1);
            default:
                return null;
        }
    } finally {
        is_analysis_in_progress = false;
    }
}

/**
 * @brief 调用额外模型解析，可能会抛出异常。
 */
export async function generateExtraModel(): Promise<string | null> {
    let did_set_extra_analysis_states = false;
    try {
        await setExtraAnalysisStates();
        did_set_extra_analysis_states = true;
        return await invokeExtraModel();
    } finally {
        if (did_set_extra_analysis_states) {
            await unsetExtraAnalysisStates();
        }
    }
}

// 在点击停止按钮时，会触发异常 `Clicked stop button`: string ,需要专门处理。
//仅内部使用，因为一部分状态的初始化是在外面执行的。
async function invokeExtraModel(generation_id?: string, batch_id?: string): Promise<string> {
    try {
        const result = await requestReply(generation_id, batch_id);

        const tag = _([...result.matchAll(/<(update(?:variable)?|variableupdate)>/gi)]).last()?.[1];
        if (!tag) {
            throw new Error(
                literalYamlify({
                    [tr('runtime.extraModel.updateTagMissing')]: result,
                })
            );
        }

        const start_index = result.lastIndexOf(`<${tag}>`);
        const end_index = result.indexOf(`</${tag}>`, start_index);
        const update_block = result.slice(
            start_index + 2 + tag.length,
            end_index === -1 ? undefined : end_index
        );

        const fn_call_match =
            /_\.(?:set|insert|assign|remove|unset|delete|add)\s*\([\s\S]*?\)\s*;/.test(
                update_block
            );
        const json_patch_match = /json_?patch/i.test(update_block);
        if (fn_call_match || json_patch_match) {
            return `<UpdateVariable>${update_block}</UpdateVariable>`;
        }

        throw new Error(
            literalYamlify({
                [tr('runtime.extraModel.updateCommandsInvalid')]: result,
            })
        );
    } finally {
        /* empty */
    }
}

function decode(string: string) {
    const binary = atob(string);
    const percent = binary
        .split('')
        .map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join('');
    return decodeURIComponent(percent);
}

const decoded_claude_head = decode(claude_head);
const decoded_gemini_head = decode(gemini_head);
const decoded_claude_tail = decode(claude_tail);
const decoded_gemini_tail = decode(gemini_tail);
const decoded_extra_model_task = decode(extra_model_task);

function isGenerateToolCallResult(
    result: string | GenerateToolCallResult
): result is GenerateToolCallResult {
    return typeof result === 'object' && result !== null && Array.isArray(result.tool_calls);
}

function normalizeGenerateResult(result: string | GenerateToolCallResult): string {
    if (!isGenerateToolCallResult(result)) {
        return result;
    }
    return extractFromGenerateToolCallResult(result) ?? result.content;
}

function normalizeGenerateResultByResponseFormat(
    result: string | GenerateToolCallResult,
    response_format: string
): string {
    if (response_format === "フォーマット出力" || response_format === V4_COMPATIBLE_FORMATTED_OUTPUT) {
        const formatted = extractFromFormattedOutput(result);
        if (formatted) {
            return formatted;
        }
    }
    return normalizeGenerateResult(result);
}

async function requestReply(generation_id?: string, batch_id?: string): Promise<string> {
    const store = useDataStore();
    if (store.settings.追加モデル解析設定.モデル出典 === "その他") throw new Error("このカードのMVUは「その他」の接続方式に対応していません。設定は保持されています。「プラグと同じ」または「カスタム」を選択してください。");
    const response_format = store.settings.追加モデル解析設定.応答フォーマット;
    const is_v4_compatible_formatted_output = response_format === V4_COMPATIBLE_FORMATTED_OUTPUT;

    assertV4CompatibleFormattedOutputUsable();

    const config: GenerateRawConfig = {
        user_input: '遵循<must>指令',
        max_chat_history: store.settings.追加モデル解析設定.max_chat_history,
        should_stream: store.settings.追加モデル解析設定.疑似ストリーミング互換,
        generation_id,
    };
    if (store.settings.追加モデル解析設定.モデル出典 === "カスタム") {
        const unset_if_equal = (value: number, expected: number) =>
            compare(store.versions.tavernhelper, '4.3.9', '>=') && value === expected
                ? 'unset'
                : value;
        config.custom_api = {
            apiurl: normalizeBaseURL(store.settings.追加モデル解析設定.apiアドレス),
            key: store.settings.追加モデル解析設定.APIキー,
            model: store.settings.追加モデル解析設定.モデル名,
            max_tokens: store.settings.追加モデル解析設定.最大応答トークン数,
            temperature: unset_if_equal(store.settings.追加モデル解析設定.温度, 1),
            frequency_penalty: unset_if_equal(store.settings.追加モデル解析設定.頻度ペナルティ, 0),
            presence_penalty: unset_if_equal(store.settings.追加モデル解析設定.存在ペナルティ, 0),
            top_p: unset_if_equal(store.settings.追加モデル解析設定.top_p, 1),
            top_k: unset_if_equal(store.settings.追加モデル解析設定.top_k, 0),
        };
        if (is_v4_compatible_formatted_output) {
            config.custom_api.source = 'custom';
            if (supportsCustomApiBody()) {
                const oai_settings = SillyTavern.chatCompletionSettings;
                if (!isPlainObject(oai_settings)) {
                    throw new Error(tr('runtime.extraModel.openAiSettingsUnavailable'));
                }
                config.custom_api.custom_include_body = buildJsonObjectCustomIncludeBody(
                    oai_settings.custom_include_body
                );
            }
        }
    }

    let task = decoded_extra_model_task;
    if (response_format === "ツール呼び出し") {
        task += `\n use \`${MVU_TOOL_DEFINITION.function.name}\` tool to update variables.`;
        store.runtimes.is_function_call_enabled = true;
        config.tools = [MVU_TOOL_DEFINITION];
        config.tool_choice = 'required';
    } else if (response_format === "フォーマット出力") {
        task +=
            '\n You are in formatted-output mode. Do not output <UpdateVariable> tags, markdown, or prose. Return only a JSON object matching the provided json_schema: {"analysis":"...","json_patch":[...]}. Put MVU JsonPatch dialect operations in `json_patch`.';
        config.json_schema = MVU_JSON_PATCH_RESPONSE_SCHEMA;
    } else if (is_v4_compatible_formatted_output) {
        task +=
            '\n You are in formatted-output mode. Do not output <UpdateVariable> tags, markdown, or prose. Return only a JSON object: {"analysis":"...","json_patch":[...]}. Put MVU JsonPatch dialect operations in `json_patch`. Return exactly one JSON object that conforms to this schema:' +
            JSON.stringify(MVU_JSON_PATCH_RESPONSE_SCHEMA.value);
    }

    //因为部分预设会用到 {{lastUserMessage}}，因此进行修正。
    //在重复注册的场合, ST 的行为会是覆盖老的，因此无所谓
    SillyTavern.registerMacro('lastUserMessage', () => {
        return task;
    });
    if (store.runtimes.debug.最初の追加リクエストを必ず失敗させる && debug_extra_request_counter === 0) {
        debug_extra_request_counter++;
        throw 'simulated exception';
    }

    if (store.settings.追加モデル解析設定.脱獄方案 === "現在のプリセットを使用") {
        clearExtraModelRequestOverrides();
        const result = await generate({
            ...config,
            injects: [
                {
                    position: 'in_chat',
                    depth: 0,
                    should_scan: false,
                    role: 'system',
                    content: task,
                },
                {
                    position: 'in_chat',
                    depth: 2,
                    should_scan: false,
                    role: 'system',
                    content: '<past_observe>',
                },
                {
                    position: 'in_chat',
                    depth: 1,
                    should_scan: false,
                    role: 'system',
                    content: '</past_observe>',
                },
            ],
        });
        return normalizeGenerateResultByResponseFormat(result, response_format);
    }

    if (store.settings.追加モデル解析設定.脱獄方案 === "その他のプリセットを使用") {
        const preset = getExtraModelPreset(store.settings.追加モデル解析設定.その他プリセット名);
        const { ordered_prompts, injects, request_overrides } = buildOtherPresetGenerateConfig(
            preset,
            task
        );

        if (store.settings.追加モデル解析設定.モデル出典 === "プラグと同じ") {
            setExtraModelRequestOverrides(request_overrides);
        } else {
            clearExtraModelRequestOverrides();
        }

        return normalizeGenerateResultByResponseFormat(
            await generateRaw({
                ...config,
                injects,
                ordered_prompts,
            }),
            response_format
        );
    }

    clearExtraModelRequestOverrides();
    const model_name =
        store.settings.追加モデル解析設定.モデル出典 === "プラグと同じ"
            ? SillyTavern.getChatCompletionModel()
            : store.settings.追加モデル解析設定.モデル名;
    const is_gemini = model_name.toLowerCase().includes('gemini');
    const rnd_header_prompts =
        store.settings.追加モデル解析設定.ランダムヘッダー && is_gemini
            ? [{ role: 'system' as const, content: batch_id ?? generateRandomHeader() }]
            : [];

    const result = await generateRaw({
        ...config,
        ordered_prompts: [
            ...rnd_header_prompts,
            { role: 'system', content: is_gemini ? decoded_gemini_head : decoded_claude_head },
            { role: 'system', content: '<additional_information>' },
            'persona_description',
            'char_description',
            'world_info_before',
            'world_info_after',
            { role: 'system', content: '</additional_information>' },
            { role: 'system', content: '<past_observe>' },
            'chat_history',
            { role: 'system', content: '</past_observe>' },
            { role: 'system', content: task },
            'user_input',
            { role: 'system', content: is_gemini ? decoded_gemini_tail : decoded_claude_tail },
        ],
    });
    return normalizeGenerateResultByResponseFormat(result, response_format);
}
