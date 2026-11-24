import { registerLampFamily } from '../registry';
import { pleatedFamily } from './pleated';
import { japaneseFluteFamily } from './japaneseFlute';
import { helicalFamily } from './helical';
import { louversFamily } from './louvers';
import { wovenFamily } from './woven';
import { organicFamily } from './organic';

let initialized = false;

/** Registers all built-in lamp families. New families can be plugged in here cleanly. */
export function initLampFamilies(): void {
  if (initialized) return;
  registerLampFamily(pleatedFamily);
  registerLampFamily(japaneseFluteFamily);
  registerLampFamily(helicalFamily);
  registerLampFamily(louversFamily);
  registerLampFamily(wovenFamily);
  registerLampFamily(organicFamily);
  initialized = true;
}

initLampFamilies();
