/**
 * **قرار المنصة في مخزن الجلسة** — لا اختبار للمنصة نفسها.
 *
 * ما يُفحص هنا هو **فرعنا نحن**: أيّ مخزن يُستدعى على أيّ منصة، وأن مخزن
 * الجوال **لا يُلمس على الويب إطلاقًا** — لأن لمسه هناك هو بعينه ما علّق
 * التطبيق على شاشة التحميل (القرار #165).
 *
 * وهذا مختلف عن «استبدال المنصة ثم فحص الاستبدال» الذي يستبعده
 * `jest.config.js`: الفرع قرارٌ كتبناه، لا سلوكُ مكتبة.
 */

interface SecureStoreMock {
  setItemAsync: jest.Mock;
  getItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
}

type SessionModule = typeof import("./session");

function loadOn(os: "web" | "ios"): { session: SessionModule; secure: SecureStoreMock } {
  jest.resetModules();
  const secure: SecureStoreMock = {
    setItemAsync: jest.fn().mockResolvedValue(undefined),
    getItemAsync: jest.fn().mockResolvedValue("رمز-الجوال"),
    deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  };
  jest.doMock("react-native", () => ({ Platform: { OS: os } }));
  jest.doMock("expo-secure-store", () => secure);
  // require لا import(): jest هنا يعمل بـCommonJS، والاستيراد الديناميكي
  // يحتاج --experimental-vm-modules فيفشل قبل أن يصل إلى ما نفحصه.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const session = require("./session") as SessionModule;
  return { session, secure };
}

/** مخزن متصفح بسيط في الذاكرة — يقيس ما كُتب فيه فعلًا. */
function installWebStore(): Map<string, string> {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => map.set(key, value),
      removeItem: (key: string) => map.delete(key),
    },
  });
  return map;
}

function removeWebStore(): void {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("التخزين محجوب في هذا المتصفح");
    },
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("مخزن الجلسة — الجوال", () => {
  it("يستعمل expo-secure-store وحده", async () => {
    const { session, secure } = loadOn("ios");
    await session.saveToken("رمز");
    await expect(session.readToken()).resolves.toBe("رمز-الجوال");
    await session.clearToken();

    expect(secure.setItemAsync).toHaveBeenCalledWith("dawajin.auth.token", "رمز");
    expect(secure.getItemAsync).toHaveBeenCalledWith("dawajin.auth.token");
    expect(secure.deleteItemAsync).toHaveBeenCalledWith("dawajin.auth.token");
  });
});

describe("مخزن الجلسة — الويب", () => {
  it("يكتب ويقرأ ويمحو من مخزن المتصفح", async () => {
    const map = installWebStore();
    const { session } = loadOn("web");

    await session.saveToken("رمز-الويب");
    expect(map.get("dawajin.auth.token")).toBe("رمز-الويب");
    await expect(session.readToken()).resolves.toBe("رمز-الويب");

    await session.clearToken();
    expect(map.has("dawajin.auth.token")).toBe(false);
  });

  it("لا يلمس expo-secure-store إطلاقًا — وهو سبب التعليق الذي عولج", async () => {
    installWebStore();
    const { session, secure } = loadOn("web");

    await session.saveToken("رمز-الويب");
    await session.readToken();
    await session.clearToken();

    expect(secure.setItemAsync).not.toHaveBeenCalled();
    expect(secure.getItemAsync).not.toHaveBeenCalled();
    expect(secure.deleteItemAsync).not.toHaveBeenCalled();
  });

  it("يعمل بلا جلسة محفوظة حين يكون التخزين محجوبًا ولا يرمي", async () => {
    removeWebStore();
    const { session } = loadOn("web");

    await expect(session.saveToken("رمز")).resolves.toBeUndefined();
    await expect(session.readToken()).resolves.toBeNull();
    await expect(session.clearToken()).resolves.toBeUndefined();
  });
});
