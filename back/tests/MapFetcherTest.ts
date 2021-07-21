import { arrayIntersect } from "../src/Services/ArrayHelper";
import { mapFetcher } from "../src/Services/MapFetcher";

describe("MapFetcher", () => {
    it("should return true on localhost ending URLs", async () => {
        expect(await mapFetcher.isLocalUrl("https://localhost")).toBeTrue();
        expect(await mapFetcher.isLocalUrl("https://foo.localhost")).toBeTrue();
    });

    it("should return true on DNS resolving to a local domain", async () => {
        expect(await mapFetcher.isLocalUrl("https://127.0.0.1.nip.io")).toBeTrue();
    });

    it("should return true on an IP resolving to a local domain", async () => {
        expect(await mapFetcher.isLocalUrl("https://127.0.0.1")).toBeTrue();
        expect(await mapFetcher.isLocalUrl("https://192.168.0.1")).toBeTrue();
    });

    it("should return false on an IP resolving to a global domain", async () => {
        expect(await mapFetcher.isLocalUrl("https://51.12.42.42")).toBeFalse();
    });

    it("should return false on an DNS resolving to a global domain", async () => {
        expect(await mapFetcher.isLocalUrl("https://maps.workadventu.re")).toBeFalse();
    });

    it("should throw error on invalid domain", async () => {
        await expectAsync(
            mapFetcher.isLocalUrl("https://this.domain.name.doesnotexistfoobgjkgfdjkgldf.com")
        ).toBeRejected();
    });
});
