import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "dd.intro.v1";

export async function introSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === "done";
  } catch {
    return false;
  }
}

export async function markIntroSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, "done");
  } catch {
    // the intro shows again next launch; nothing else depends on it
  }
}

export async function resetIntro(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
