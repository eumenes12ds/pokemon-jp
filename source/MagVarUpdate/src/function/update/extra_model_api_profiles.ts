import { tr } from '@/i18n';

export type ExtraModelApiProfile = {
    [key: string]: unknown;
    名前: string;
    apiアドレス: string;
    APIキー: string;
    モデル名: string;
};

export type ExtraModelApiProfileFields = {
    apiアドレス: string;
    APIキー: string;
    モデル名: string;
    apiプロファイル一覧: ExtraModelApiProfile[];
    現在のapiプロファイル: string;
};

export const DEFAULT_EXTRA_MODEL_API_PROFILE_NAME = "既定";

export function extractExtraModelApiProfileFields(
    config: ExtraModelApiProfileFields
): ExtraModelApiProfile {
    return {
        名前: config.現在のapiプロファイル || DEFAULT_EXTRA_MODEL_API_PROFILE_NAME,
        apiアドレス: config.apiアドレス,
        APIキー: config.APIキー,
        モデル名: config.モデル名,
    };
}

export function applyExtraModelApiProfile(
    config: ExtraModelApiProfileFields,
    profile: ExtraModelApiProfile
): ExtraModelApiProfileFields {
    return {
        ...config,
        apiアドレス: profile.apiアドレス,
        APIキー: profile.APIキー,
        モデル名: profile.モデル名,
        現在のapiプロファイル: profile.名前,
    };
}

export function upsertExtraModelApiProfile(
    profiles: ExtraModelApiProfile[],
    profile: ExtraModelApiProfile
): ExtraModelApiProfile[] {
    const normalized_name = profile.名前.trim();
    if (!normalized_name) {
        throw new Error(tr('runtime.apiProfile.nameRequired'));
    }

    const next_profile = {
        ...profile,
        名前: normalized_name,
    };
    const existing_index = profiles.findIndex(item => item.名前 === normalized_name);
    if (existing_index === -1) {
        return [...profiles, next_profile];
    }

    const next_profiles = [...profiles];
    next_profiles[existing_index] = {
        ...profiles[existing_index],
        ...next_profile,
    };
    return next_profiles;
}

export function removeExtraModelApiProfile(
    profiles: ExtraModelApiProfile[],
    profile_name: string
): ExtraModelApiProfile[] {
    return profiles.filter(profile => profile.名前 !== profile_name);
}

export function hasExtraModelApiProfile(
    profiles: ExtraModelApiProfile[],
    profile_name: string
): boolean {
    return profiles.some(profile => profile.名前 === profile_name.trim());
}

export function isActiveExtraModelApiProfileDirty(config: ExtraModelApiProfileFields): boolean {
    const active_name = config.現在のapiプロファイル.trim();
    if (!active_name) {
        return false;
    }

    const profile = config.apiプロファイル一覧.find(item => item.名前 === active_name);
    if (!profile) {
        return false;
    }

    return (
        profile.apiアドレス !== config.apiアドレス ||
        profile.APIキー !== config.APIキー ||
        profile.モデル名 !== config.モデル名
    );
}

export function clearUnboundExtraModelApiProfileFields(
    config: ExtraModelApiProfileFields
): ExtraModelApiProfileFields {
    return {
        ...config,
        現在のapiプロファイル: '',
        apiアドレス: '',
        APIキー: '',
        モデル名: '',
    };
}

export function reconcileExtraModelApiProfileSelection<T extends ExtraModelApiProfileFields>(
    config: T
): T {
    const active_name = config.現在のapiプロファイル.trim();
    if (!active_name) {
        return config;
    }

    if (hasExtraModelApiProfile(config.apiプロファイル一覧, active_name)) {
        return config;
    }

    if (config.apiプロファイル一覧.length === 0) {
        return {
            ...config,
            現在のapiプロファイル: '',
        };
    }

    return applyExtraModelApiProfile(
        {
            ...config,
            apiプロファイル一覧: config.apiプロファイル一覧,
        },
        config.apiプロファイル一覧[0]
    ) as T;
}

export function deleteActiveExtraModelApiProfile(
    config: ExtraModelApiProfileFields,
    profile_name: string
): ExtraModelApiProfileFields {
    const remaining = removeExtraModelApiProfile(config.apiプロファイル一覧, profile_name);
    if (remaining.length === 0) {
        return {
            ...config,
            apiプロファイル一覧: [],
            現在のapiプロファイル: '',
            apiアドレス: '',
            APIキー: '',
            モデル名: '',
        };
    }

    return applyExtraModelApiProfile(
        {
            ...config,
            apiプロファイル一覧: remaining,
        },
        remaining[0]
    );
}

export type ExtraModelApiProfileDeletionConfirmation = 'discard_unsaved_changes' | 'delete_profile';

export async function deleteActiveExtraModelApiProfileWithConfirmation(
    config: ExtraModelApiProfileFields,
    profile_name: string,
    confirm: (confirmation: ExtraModelApiProfileDeletionConfirmation) => Promise<boolean>
): Promise<ExtraModelApiProfileFields | null> {
    if (isActiveExtraModelApiProfileDirty(config) && !(await confirm('discard_unsaved_changes'))) {
        return null;
    }

    if (!(await confirm('delete_profile'))) {
        return null;
    }

    return deleteActiveExtraModelApiProfile(config, profile_name);
}

export function migrateExtraModelApiProfiles<T extends ExtraModelApiProfileFields>(config: T): T {
    let migrated = config;

    if (migrated.apiプロファイル一覧.length === 0) {
        const has_legacy_custom_api =
            migrated.apiアドレス.trim().length > 0 ||
            migrated.APIキー.trim().length > 0 ||
            migrated.モデル名.trim().length > 0;
        if (has_legacy_custom_api) {
            migrated = {
                ...migrated,
                apiプロファイル一覧: [
                    {
                        名前: DEFAULT_EXTRA_MODEL_API_PROFILE_NAME,
                        apiアドレス: migrated.apiアドレス,
                        APIキー: migrated.APIキー,
                        モデル名: migrated.モデル名,
                    },
                ],
                現在のapiプロファイル: migrated.現在のapiプロファイル || DEFAULT_EXTRA_MODEL_API_PROFILE_NAME,
            };
        }
    }

    return reconcileExtraModelApiProfileSelection(migrated);
}

export function selectExtraModelApiProfile(
    config: ExtraModelApiProfileFields,
    profile_name: string
): ExtraModelApiProfileFields {
    const profile = config.apiプロファイル一覧.find(item => item.名前 === profile_name);
    if (!profile) {
        throw new Error(
            tr('runtime.apiProfile.notFound', {
                name: profile_name,
            })
        );
    }
    return applyExtraModelApiProfile(config, profile);
}

export function saveCurrentExtraModelApiProfile(
    config: ExtraModelApiProfileFields,
    profile_name?: string
): ExtraModelApiProfileFields {
    const target_name = (profile_name ?? config.現在のapiプロファイル).trim();
    if (!target_name) {
        throw new Error(tr('runtime.apiProfile.selectOrEnterName'));
    }

    if (
        hasExtraModelApiProfile(config.apiプロファイル一覧, target_name) &&
        config.現在のapiプロファイル.trim() !== target_name
    ) {
        throw new Error(
            tr('runtime.apiProfile.alreadyExists', {
                name: target_name,
            })
        );
    }

    const source_profile = config.apiプロファイル一覧.find(item => item.名前 === config.現在のapiプロファイル.trim());
    const profile = {
        ...source_profile,
        ...extractExtraModelApiProfileFields(config),
        名前: target_name,
    };
    return {
        ...config,
        現在のapiプロファイル: target_name,
        apiプロファイル一覧: upsertExtraModelApiProfile(config.apiプロファイル一覧, profile),
    };
}

export function saveAsNewExtraModelApiProfile(
    config: ExtraModelApiProfileFields,
    profile_name: string
): ExtraModelApiProfileFields {
    const target_name = profile_name.trim();
    if (!target_name) {
        throw new Error(tr('runtime.apiProfile.enterNewName'));
    }
    if (hasExtraModelApiProfile(config.apiプロファイル一覧, target_name)) {
        throw new Error(
            tr('runtime.apiProfile.alreadyExists', {
                name: target_name,
            })
        );
    }
    return saveCurrentExtraModelApiProfile(config, target_name);
}
