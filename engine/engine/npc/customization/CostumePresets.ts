/**
 * @fileoverview Costume Presets - Easy Character Costumes
 *
 * ════════════════════════════════════════════════════════════════════════════════
 * 🎭 COSTUME SYSTEM - QUICK CHARACTER APPEARANCE
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * Use these presets to quickly apply full costumes to player or NPC characters.
 * Each costume sets all relevant colors and accessories for a complete look.
 *
 * ## Available Costumes
 *
 * | Costume | Description |
 * |---------|-------------|
 * | MONK | Brown hooded robe, tan trousers, brown boots |
 * | DARK_MONK | Black hooded robe, dark gray trousers, black gloves |
 * | ARMORED_TROOPER | White armor, black visor and details, white helmet |
 * | KNIGHT | Metal armor, helmet with plume, gauntlets |
 * | SOLDIER | Camo greens, military helmet, tactical gear |
 *
 * ## Usage
 *
 * ## Creating Custom Costumes
 *
 * These presets are examples - mix and match or create your own!
 */

import { createCustomizedNpcFactory } from 'engine/npc/customization/NpcCustomization.js';
import type { IBlockCharacterFactory } from 'engine/IBlockCharacterFactory.js';
import type { NpcCustomizationConfig } from 'engine/npc/customization/NpcCustomization.js';

// ════════════════════════════════════════════════════════════════════════════════
// COSTUME TYPES
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Built-in costume types
 */
export const CostumeType = {
	MONK: 'monk',
	DARK_MONK: 'dark_monk',
	ARMORED_TROOPER: 'armored_trooper',
	KNIGHT: 'knight',
	SOLDIER: 'soldier'
} as const;

export type CostumeTypeId = typeof CostumeType[keyof typeof CostumeType];

// ════════════════════════════════════════════════════════════════════════════════
// COSTUME CONFIGURATIONS
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Monk costume - Brown hooded robe
 * Earthy brown and tan robes with a cape
 */
const MONK_CONFIG: NpcCustomizationConfig = {
	skinColor: 0xFFDBB3, // Light skin
	clothing: {
		shirtColor: 0x8B6914, // Brown robe/tunic
		pantsColor: 0xD2B48C, // Tan pants
		bootsColor: 0x5C4033, // Dark brown boots
		hatType: 'hood',
		hatColor: 0x8B6914, // Brown hood
		belt: {
			color: 0x4A3728, // Dark brown belt
			width: 1.2
		},
		accessories: {
			cape: 0x6B4423 // Brown outer robe/cape
		}
	},
	bodyShape: {
		height: 1.8,
		width: 0.48
	},
	features: {
		eyeColor: 0x4169E1 // Blue eyes
	}
};

/**
 * Dark monk costume - Black hooded robe
 * Black and dark gray robes with gloves and yellow eyes
 */
const DARK_MONK_CONFIG: NpcCustomizationConfig = {
	skinColor: 0xE0D0C0, // Pale skin
	clothing: {
		shirtColor: 0x1a1a1a, // Black robe/tunic
		pantsColor: 0x2a2a2a, // Dark gray pants
		bootsColor: 0x0a0a0a, // Black boots
		hatType: 'hood',
		hatColor: 0x0a0a0a, // Black hood
		belt: {
			color: 0x1a1a1a, // Black belt
			width: 1.2
		},
		accessories: {
			cape: 0x0a0a0a, // Black outer robe/cape
			gloves: 0x1a1a1a // Black gloves
		}
	},
	bodyShape: {
		height: 1.85,
		width: 0.5
	},
	features: {
		eyeColor: 0xFFCC00 // Yellow eyes
	}
};

/**
 * Armored trooper costume - White armor with a full helmet
 * White-armored soldier with visor eyes and a mouth filter
 */
const ARMORED_TROOPER_CONFIG: NpcCustomizationConfig = {
	skinColor: 0xFFFFFF, // White (armor covers skin)
	clothing: {
		shirtColor: 0xFFFFFF, // White armor torso
		pantsColor: 0xFFFFFF, // White armor legs
		bootsColor: 0xFFFFFF, // White boots
		hatType: 'helmet',
		hatColor: 0xFFFFFF, // White helmet
		accessories: {
			gloves: 0x1a1a1a, // Black gloves
			shoulderPads: 0xFFFFFF, // White shoulder armor
			kneePads: 0xFFFFFF, // White knee armor
			elbowPads: 0xFFFFFF, // White elbow armor
			mask: 0x1a1a1a // Black mouth filter/vent
		},
		belt: {
			color: 0x1a1a1a, // Black belt
			width: 1.0
		}
	},
	bodyShape: {
		height: 1.8,
		width: 0.52,
		torsoSize: 1.1
	},
	features: {
		eyeColor: 0x000000, // Black visor color
		visorEyes: true // Triangular visor eyes (full-face helmet)
	}
};

/**
 * Knight costume - Metal armor with helmet and plume
 * Medieval knight in shining armor
 */
const KNIGHT_CONFIG: NpcCustomizationConfig = {
	skinColor: {
		color: 0xC0C0C0, // Silver armor (covers skin)
		metalness: 0.9,
		roughness: 0.2
	},
	clothing: {
		shirtColor: 0xA8A8A8, // Silver chest armor
		pantsColor: 0x909090, // Silver leg armor
		bootsColor: 0x808080, // Steel boots
		hatType: 'helmet',
		hatColor: 0xB0B0B0, // Steel helmet
		accessories: {
			gloves: 0x888888, // Steel gauntlets
			shoulderPads: 0xA0A0A0, // Steel pauldrons
			kneePads: 0x909090, // Steel knee guards
			elbowPads: 0x909090, // Steel elbow guards
			cape: 0x8B0000 // Red cape (plume represented by cape color)
		},
		belt: {
			color: 0x4A3728, // Leather belt
			width: 1.3
		}
	},
	bodyShape: {
		height: 1.85,
		width: 0.58,
		torsoSize: 1.15
	},
	features: {
		eyeColor: 0x4169E1 // Blue eyes (visible through visor)
	}
};

/**
 * Soldier costume - Camo greens with military helmet
 * Modern military appearance
 */
const SOLDIER_CONFIG: NpcCustomizationConfig = {
	skinColor: 0xD2B48C, // Tan skin
	clothing: {
		shirtColor: 0x4B5320, // Olive drab / army green
		pantsColor: 0x556B2F, // Dark olive green (camo)
		bootsColor: 0x3D3D3D, // Black combat boots
		hatType: 'helmet',
		hatColor: 0x4B5320, // Olive drab helmet
		accessories: {
			gloves: 0x3D3D3D, // Black tactical gloves
			shoulderPads: 0x4B5320, // Shoulder armor (green)
			kneePads: 0x3D3D3D, // Black knee pads
			elbowPads: 0x3D3D3D, // Black elbow pads
			backpack: 0x4B5320 // Military backpack
		},
		belt: {
			color: 0x3D3D3D, // Black tactical belt
			width: 1.2
		}
	},
	bodyShape: {
		height: 1.8,
		width: 0.52,
		torsoSize: 1.05
	},
	features: {
		eyeColor: 0x2F4F4F // Dark gray eyes
	}
};

// ════════════════════════════════════════════════════════════════════════════════
// COSTUME CONFIG REGISTRY
// ════════════════════════════════════════════════════════════════════════════════

/**
 * All costume configurations indexed by type
 * Use this to get the raw config for customization
 */
export const COSTUME_CONFIGS: Record<CostumeTypeId, NpcCustomizationConfig> = {
	[CostumeType.MONK]: MONK_CONFIG,
	[CostumeType.DARK_MONK]: DARK_MONK_CONFIG,
	[CostumeType.ARMORED_TROOPER]: ARMORED_TROOPER_CONFIG,
	[CostumeType.KNIGHT]: KNIGHT_CONFIG,
	[CostumeType.SOLDIER]: SOLDIER_CONFIG
};

// ════════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS - Easy NPC Creation
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Create a Monk NPC factory
 * Brown hooded robe, tan trousers, brown boots, blue eyes
 */
export function createMonkNpcFactory(): IBlockCharacterFactory {
	return createCustomizedNpcFactory(MONK_CONFIG);
}

/**
 * Create a Dark Monk NPC factory
 * Black hooded robe, dark trousers, black boots, yellow eyes
 */
export function createDarkMonkNpcFactory(): IBlockCharacterFactory {
	return createCustomizedNpcFactory(DARK_MONK_CONFIG);
}

/**
 * Create an Armored Trooper NPC factory
 * White armor, black visor and details, white helmet
 */
export function createArmoredTrooperNpcFactory(): IBlockCharacterFactory {
	return createCustomizedNpcFactory(ARMORED_TROOPER_CONFIG);
}

/**
 * Create a Knight NPC factory
 * Metal armor, helmet, red cape (plume)
 */
export function createKnightNpcFactory(): IBlockCharacterFactory {
	return createCustomizedNpcFactory(KNIGHT_CONFIG);
}

/**
 * Create a Soldier NPC factory
 * Camo greens, military helmet, tactical gear
 */
export function createSoldierNpcFactory(): IBlockCharacterFactory {
	return createCustomizedNpcFactory(SOLDIER_CONFIG);
}

// ════════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Get a costume factory by type string
 * Useful when costume type comes from configuration
 *
 * @param costumeType - Costume type string (monk, knight, etc.)
 * @returns IBlockCharacterFactory for the costume, or null if not found
 */
export function getCostumeFactory(costumeType: string): IBlockCharacterFactory | null {
	const config = COSTUME_CONFIGS[costumeType as CostumeTypeId];
	if (!config) {
		console.warn(`[CostumePresets] Unknown costume type: ${costumeType}`);
		return null;
	}
	return createCustomizedNpcFactory(config);
}

/**
 * Create a custom costume by merging with a base costume
 * Useful for creating variations of existing costumes
 *
 * @param baseCostume - Base costume type to start from
 * @param overrides - Properties to override
 * @returns IBlockCharacterFactory with merged configuration
 */
export function createCustomCostume(
	baseCostume: CostumeTypeId,
	overrides: Partial<NpcCustomizationConfig>
): IBlockCharacterFactory {
	const baseConfig = COSTUME_CONFIGS[baseCostume];
	const mergedConfig: NpcCustomizationConfig = {
		...baseConfig,
		...overrides,
		clothing: {
			...baseConfig.clothing,
			...overrides.clothing,
			accessories: {
				...baseConfig.clothing?.accessories,
				...overrides.clothing?.accessories
			},
			belt: {
				...baseConfig.clothing?.belt,
				...overrides.clothing?.belt
			}
		},
		bodyShape: {
			...baseConfig.bodyShape,
			...overrides.bodyShape
		},
		features: {
			...baseConfig.features,
			...overrides.features
		}
	};
	return createCustomizedNpcFactory(mergedConfig);
}

