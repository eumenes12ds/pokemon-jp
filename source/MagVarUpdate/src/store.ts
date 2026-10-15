import { decodeMvuSettings, encodeMvuSettings, readMvuSettings } from '@/settings_compat';
import { migrateExtraModelApiProfiles } from '@/function/update/extra_model_api_profiles';
import {
    CharacterSettingsOverride,
    CharacterSettingsOverridePath,
    getCharacterSettingsOverrideValue,
    hasActiveCharacterSettingsOverride,
    hasOwnCharacterSettingsOverride,
} from '@/function/character_override/schema';
import { is_jest_environment } from '@/jest';
import { registerAsUniqueScript } from '@util/script';
import { klona } from 'klona';
import { defineStore } from 'pinia';
import { computed, ref, toRaw, watch } from 'vue';
import * as z from 'zod';

const ExtraModelApiProfile = z
    .object({
        名前: z.string().min(1),
        apiアドレス: z.string().default(''),
        APIキー: z.string().default(''),
        モデル名: z.string().default(''),
    })
    .loose();

export const EXTRA_MODEL_RESPONSE_FORMATS = [
    "チャットメッセージ",
    "ツール呼び出し",
    "フォーマット出力",
    "フォーマット出力(v4互換)",
] as const;

const ExtraModelResponseFormat = z.enum(EXTRA_MODEL_RESPONSE_FORMATS);

const OldSettings = z
    .object({
        通知: z
            .object({
                変数更新エラー: z.boolean(),
                追加モデル解析中: z.boolean(),
            })
            .loose(),
        更新方式: z.enum(["主AI追従出力", "追加モデル解析"]),
        追加モデル解析を自動トリガー: z.boolean(),
        追加モデル解析設定: z
            .object({
                プリセット送信: z.boolean(),
                関数呼び出しを使用: z.boolean(),
                モデル出典: z.enum(["プラグと同じ", "カスタム", "その他"]),
                apiアドレス: z.string(),
                APIキー: z.string(),
                モデル名: z.string(),
                温度: z.coerce.number(),
                頻度ペナルティ: z.coerce.number(),
                存在ペナルティ: z.coerce.number(),
                top_p: z.coerce.number(),
                最大応答トークン数: z.coerce.number(),
            })
            .loose(),
        スナップショット保持間隔: z.number(),
        チャット変数に更新: z.boolean(),
        legacy: z
            .object({
                旧機能を表示: z.boolean(),
            })
            .loose(),
        auto_cleanup: z
            .object({
                有効: z.boolean(),
                保持する変数の最近階層スタック数: z.number(),
                復元をトリガーする変数の最近階層スタック数: z.number(),
            })
            .loose(),
        internal: z
            .object({
                設定画面更新を通知済み: z.boolean(),
                自動クリーンアップ旧変数機能を通知済み: z.boolean(),
                API温度等の設定更新を通知済み: z.boolean(),
                自動クリーンアップ旧変数機能を既定で有効化済み: z.boolean(),
            })
            .loose(),
    })
    .loose()
    .transform(data => {
        const {
            追加モデル解析を自動トリガー,
            追加モデル解析設定: { プリセット送信, 関数呼び出しを使用, ...extra_model_settings },
            スナップショット保持間隔,
            チャット変数に更新,
            legacy,
            auto_cleanup,
            自動クリーンアップ変数: existing_auto_cleanup,
            互換性: existing_compatibility,
            ...settings
        } = data;
        const existing_auto_cleanup_settings = _.isPlainObject(existing_auto_cleanup)
            ? (existing_auto_cleanup as Record<string, unknown>)
            : {};
        const existing_compatibility_settings = _.isPlainObject(existing_compatibility)
            ? (existing_compatibility as Record<string, unknown>)
            : {};

        return NewSettings.decode({
            ...settings,
            追加モデル解析設定: {
                脱獄方案: プリセット送信 ? "現在のプリセットを使用" : "内蔵脱獄を使用",
                自動リクエスト有効: 追加モデル解析を自動トリガー,
                応答フォーマット: 関数呼び出しを使用 ? "ツール呼び出し" : "チャットメッセージ",
                ...extra_model_settings,
            },
            自動クリーンアップ変数: {
                ...auto_cleanup,
                スナップショット保持間隔,
                ...existing_auto_cleanup_settings,
            },
            互換性: {
                ...legacy,
                チャット変数に更新,
                ...existing_compatibility_settings,
            },
        });
    });

const NewSettings = z
    .object({
        通知: z
            .object({
                MVUフレームワーク読み込み成功: z.boolean().default(true),
                変数初期化成功: z.boolean().default(true),
                変数更新エラー: z.boolean().default(false),
                追加モデル解析中: z.boolean().default(true),
            })
            .loose()
            .prefault({}),
        更新方式: z.enum(["主AI追従出力", "追加モデル解析"]).catch("主AI追従出力").default("主AI追従出力"),
        追加モデル解析設定: z
            .object({
                脱獄方案: z
                    .enum(["内蔵脱獄を使用", "現在のプリセットを使用", "その他のプリセットを使用"])
                    .default("内蔵脱獄を使用"),
                その他プリセット名: z.string().default(''),
                関数呼び出しを使用: z.boolean().optional(),
                応答フォーマット: ExtraModelResponseFormat.optional(),
                thinking無効: z.boolean().default(false),
                疑似ストリーミング互換: z.boolean().default(false),
                ランダムヘッダー: z.boolean().default(true),

                自動リクエスト有効: z.boolean().default(true),
                リクエスト方式: z
                    .enum([
                        "順番にリクエストし、失敗したら再試行",
                        "同時に複数回リクエスト",
                        "最初に1回リクエストし、失敗したら同時に複数回リクエスト",
                    ])
                    .default("順番にリクエストし、失敗したら再試行"),
                リクエスト回数: z.number().default(3),
                ワールドブックエントリホワイトリスト正規表現: z.string().default(''),
                ワールドブックエントリブラックリスト正規表現: z.string().default(''),

                モデル出典: z.enum(["プラグと同じ", "カスタム", "その他"]).default("プラグと同じ"),
                apiアドレス: z.string().default('http://localhost:1234/v1'),
                APIキー: z.string().default(''),
                モデル名: z.string().default('gemini-2.5-flash-nothinking'),
                温度: z.coerce
                    .number()
                    .default(1)
                    .transform(value => _.clamp(value, 0, 2)),
                頻度ペナルティ: z.coerce
                    .number()
                    .default(0.0)
                    .transform(value => _.clamp(value, -2, 2)),
                存在ペナルティ: z.coerce
                    .number()
                    .default(0.0)
                    .transform(value => _.clamp(value, -2, 2)),
                top_p: z.coerce
                    .number()
                    .default(1)
                    .transform(value => _.clamp(value, 0, 1)),
                top_k: z.coerce
                    .number()
                    .default(0)
                    .transform(value => _.clamp(value, 0, 500)),
                max_chat_history: z.coerce
                    .number()
                    .default(2)
                    .transform(value => _.clamp(Math.round(value), 2, 100)),
                最大応答トークン数: z.coerce
                    .number()
                    .default(4096)
                    .transform(value => Math.max(0, value)),
                apiプロファイル一覧: z.array(ExtraModelApiProfile).default([]),
                現在のapiプロファイル: z.string().default(''),
            })
            .loose()
            .transform(({ 関数呼び出しを使用, 応答フォーマット, ...data }) =>
                migrateExtraModelApiProfiles({
                    ...data,
                    応答フォーマット: 応答フォーマット ?? (関数呼び出しを使用 ? "ツール呼び出し" : "チャットメッセージ"),
                })
            )
            .prefault({}),
        自動クリーンアップ変数: z
            .object({
                有効: z.boolean().default(true),
                スナップショット保持間隔: z.number().default(50),
                保持する変数の最近階層スタック数: z.number().default(20),
                復元をトリガーする変数の最近階層スタック数: z.number().default(10),
            })
            .loose()
            .prefault({}),
        互換性: z
            .object({
                チャット変数に更新: z.boolean().default(false),
                旧機能を表示: z.boolean().default(false),
                sendasをuserメッセージとみなさない: z.boolean().optional(),
                sandasをuserメッセージとみなさない: z.boolean().optional(),
            })
            .loose()
            .transform(({ sendasをuserメッセージとみなさない, sandasをuserメッセージとみなさない, ...data }) => ({
                ...data,
                チャット変数に更新: data.チャット変数に更新,
                旧機能を表示: data.旧機能を表示,
                sendasをuserメッセージとみなさない: sendasをuserメッセージとみなさない ?? sandasをuserメッセージとみなさない ?? false,
            }))
            .prefault({}),
        internal: z
            .object({
                設定画面更新を通知済み: z.boolean().default(false),
                自動クリーンアップ旧変数機能を通知済み: z.boolean().default(false),
                API温度等の設定更新を通知済み: z.boolean().default(false),
                自動クリーンアップ旧変数機能を既定で有効化済み: z.boolean().default(false),
                内蔵脱獄を通知済み: z.boolean().default(false),
                追加モデル同時リクエストを通知済み: z.boolean().default(false),
                既定で疑似ストリーミング非互換を有効化済み: z.boolean().default(false),
            })
            .loose()
            .prefault({}),
    })
    .loose()
    .transform(data => {
        if (data.internal.既定で疑似ストリーミング非互換を有効化済み === false) {
            data.追加モデル解析設定.疑似ストリーミング互換 = false;
            data.internal.既定で疑似ストリーミング非互換を有効化済み = true;
        }
        return data;
    })
    .prefault({});

const Settings = z.preprocess(decodeMvuSettings, z.union([OldSettings, NewSettings]).catch(() => NewSettings.parse({})));

export type MvuSettings = z.infer<typeof NewSettings>;

export type CharacterSettingsState = {
    status: 'loading' | 'unbound' | 'ready' | 'error';
    character_name: string;
    worldbook_name: string | null;
    entry_uid: number | null;
    expected_content: string | null;
    draft: CharacterSettingsOverride;
    is_valid: boolean;
    revision: number;
    has_pending_save: boolean;
    is_saving: boolean;
};

function createCharacterSettingsState(): CharacterSettingsState {
    return {
        status: 'loading',
        character_name: '',
        worldbook_name: null,
        entry_uid: null,
        expected_content: null,
        draft: {},
        is_valid: true,
        revision: 0,
        has_pending_save: false,
        is_saving: false,
    };
}

const Runtimes = z
    .object({
        unsupported_warnings: z.string().default(''),
        is_during_extra_analysis: z.boolean().default(false),
        is_function_call_enabled: z.boolean().default(false),
        前回の世界書エントリー選別結果: z
            .array(
                z.object({
                    lore: z.enum(['globalLore', 'characterLore', 'chatLore', 'personaLore']),
                    world: z.string(),
                    comment: z.string(),
                    reason: z.enum(["許可リスト", "拒否リスト"]),
                    sources: z.array(z.enum(["ユーザー共通設定", "キャラクターカード設定"])).default([]),
                })
            )
            .default([]),
        debug: z
            .object({
                最初の追加リクエストを必ず失敗させる: z.boolean().default(false),
            })
            .prefault({}),
    })
    .prefault({});

export const useDataStore = defineStore('MVU変数フレームワーク', () => {
    const settings = ref(Settings.parse(readMvuSettings()));
    watch(
        settings,
        new_settings => {
            _.set(SillyTavern.extensionSettings, 'mvu_jp_settings', encodeMvuSettings(toRaw(new_settings)));
            if (!is_jest_environment) SillyTavern.saveSettingsDebounced();
        },
        { deep: true }
    );
    const _reload_settings = () => {
        settings.value = Settings.parse(readMvuSettings());
    };

    const character_settings = ref<CharacterSettingsState>(createCharacterSettingsState());
    const effective_settings = computed<MvuSettings>(() => {
        // 运行时读取合并后的配置，但不修改用户持久化的全局设置。
        const result = klona(settings.value);
        if (!character_settings.value.is_valid) {
            return result;
        }

        const draft = character_settings.value.draft;
        // 正则采用“全局 + 角色卡”的叠加语义，由 filterEntries 单独合并，不在此处覆盖。
        if (_.has(draft, '更新方式')) {
            result.更新方式 = draft.更新方式!;
        }
        if (_.has(draft, "追加モデル解析設定.自動リクエスト有効")) {
            result.追加モデル解析設定.自動リクエスト有効 = draft.追加モデル解析設定!.自動リクエスト有効!;
        }
        if (_.has(draft, "互換性.チャット変数に更新")) {
            result.互換性.チャット変数に更新 = draft.互換性!.チャット変数に更新!;
        }
        if (_.has(draft, "互換性.sendasをuserメッセージとみなさない")) {
            result.互換性.sendasをuserメッセージとみなさない = draft.互換性!.sendasをuserメッセージとみなさない!;
        }
        return result;
    });
    const has_character_settings_override = (path: CharacterSettingsOverridePath) =>
        character_settings.value.is_valid &&
        hasOwnCharacterSettingsOverride(character_settings.value.draft, path);
    const get_character_settings_override = (path: CharacterSettingsOverridePath) =>
        character_settings.value.is_valid
            ? getCharacterSettingsOverrideValue(character_settings.value.draft, path)
            : undefined;
    const is_character_settings_override_active = computed(
        () =>
            character_settings.value.is_valid &&
            hasActiveCharacterSettingsOverride(character_settings.value.draft)
    );
    const resetCharacterSettings = () => {
        character_settings.value = createCharacterSettingsState();
    };

    const runtimes = ref(Runtimes.parse({}));
    watch(
        () => runtimes.value.is_during_extra_analysis,
        new_value => insertOrAssignVariables({ extra_analysis: new_value }, { type: 'global' }),
        { immediate: true }
    );
    const resetRuntimes = () => {
        runtimes.value = Runtimes.parse({});
    };

    const versions = ref<{ sillytavern: string; tavernhelper: string }>({
        sillytavern: '',
        tavernhelper: '',
    });
    const _wait_init = async () => {
        versions.value.sillytavern = await fetch('/version')
            .then(res => res.json())
            .then(data => data.pkgVersion)
            .catch(() => '1.0.0');
        versions.value.tavernhelper = await getTavernHelperVersion();
    };

    const should_enable = ref<boolean>(false);
    watch(should_enable, (new_enable, old_enable) => {
        if (new_enable && !old_enable) {
            _reload_settings();
        }
    });

    // 当存在多个 MVU 脚本实例时，仅优先实例应启用运行逻辑。
    registerAsUniqueScript('MVU变量框架').listenPreferenceState(preferred_script_id => {
        should_enable.value = preferred_script_id === getScriptId();
    });

    return {
        settings,
        replaceSettings: (value: unknown) => { settings.value = Settings.parse(decodeMvuSettings(value)); },
        _reload_settings,
        character_settings,
        effective_settings,
        has_character_settings_override,
        get_character_settings_override,
        is_character_settings_override_active,
        resetCharacterSettings,
        runtimes,
        resetRuntimes,
        versions,
        _wait_init,
        should_enable,
    };
});
