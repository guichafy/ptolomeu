import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
	it("mescla classes simples", () => {
		expect(cn("foo", "bar")).toBe("foo bar");
	});

	it("resolve conflitos de classes Tailwind", () => {
		expect(cn("p-2", "p-4")).toBe("p-4");
	});

	it("lida com inputs condicionais", () => {
		expect(cn("base", false && "hidden")).toBe("base");
		expect(cn("base", true && "visible")).toBe("base visible");
	});

	it("ignora valores falsy", () => {
		expect(cn("base", undefined, null, "extra")).toBe("base extra");
	});
});
