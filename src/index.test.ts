import { deserialize, normalize, print } from ".";
import fs from "fs";
import { ArrayContent } from "./deserializer";

describe("primitive deserialization", () => {
  const buff = fs.readFileSync("samples/primitive.bin");

  test("deserialization works", () => {
    const result = deserialize(buff);
    expect(result.objects.length).toBeGreaterThan(0);
  });

  test("normalization of primitive types work", () => {
    const result = deserialize(buff);
    const normalized = normalize(result.objects)[0];
    expect(normalized["f_boolean"]).toBe(true);
    expect(normalized["f_byte"]).toBe(1);
    expect(normalized["f_char"]).toBe("a");
    expect(normalized["f_double"]).toBe(1.1);

    // The rounding is done intentionally as the float is calculated to 2.2000000476837
    expect(
      Math.round((normalized["f_float"] + Number.EPSILON) * 100) / 100
    ).toBe(2.2);

    expect(normalized["f_int"]).toBe(3);

    // long is read as readBigInt64BE, and converted to a string during normalization
    expect(normalized["f_long"]).toBe("4");
    expect(normalized["f_short"]).toBe(5);
  });
});

describe("complex object", () => {
  const buff = fs.readFileSync("samples/people.bin");

  test("deserialization works", () => {
    const x = deserialize(buff);
    expect(x.objects.length).toBeGreaterThan(0);
  });

  test("normalization works", () => {
    const x = deserialize(buff);
    const val = normalize(x.objects)[0];
    expect(val.length).toBe(2);
    expect(val[0]["age"]).toBe(65);
    expect(val[1]["age"]).toBe(50);
  });
});

describe("cyclic object", () => {
  const buff = fs.readFileSync("samples/cyclic.bin");

  test("deserialization works", () => {
    const x = deserialize(buff);
    expect(x.objects.length).toBeGreaterThan(0);
  });

  test("clycles detected in normalization", () => {
    const x = deserialize(buff);
    const val = normalize(x.objects)[0];
    expect(val["next"]["next"]["next"]["next"]).toContain("cycle-ref");
  });
});

describe("primitive wrapper deserialization", () => {
  const buff = fs.readFileSync("samples/primitive_wrapper.bin");

  test("normalization of primitive wrapper types work", () => {
    const result = deserialize(buff);
    const normalized = normalize(result.objects)[0];
    expect(normalized["f_boolean"]).toBe(true);
    expect(normalized["f_byte"]).toBe(1);
    expect(normalized["f_char"]).toBe("a");
    expect(normalized["f_double"]).toBe(1.1);

    // The rounding is done intentionally as the float is calculated to 2.2000000476837
    expect(
      Math.round((normalized["f_float"] + Number.EPSILON) * 100) / 100
    ).toBe(2.2);

    expect(normalized["f_int"]).toBe(3);

    // long is read as readBigInt64BE, and converted to a string during normalization
    expect(normalized["f_long"]).toBe("4");
    expect(normalized["f_short"]).toBe(5);
  });
});

describe("normalization", () => {
  test("unsupported base content types should not be normalized", () => {
    const normalized = normalize([new ArrayContent(1, "test", [])]);
    expect(normalized).toEqual([]);
  });

  test("vectors", () => {
    const buff = fs.readFileSync("samples/vector.bin");
    const result = deserialize(buff);
    const normalized = normalize(result.objects)[0];
    expect(normalized).toEqual(["1", "2", "2", "4"]);
  });

  test("maps", () => {
    const buff = fs.readFileSync("samples/maps.bin");
    const result = deserialize(buff);
    const normalized = normalize(result.objects)[0];
    expect(normalized).toEqual({ k1: "v1", k2: "v2" });
  });

  test("byte arrays", () => {
    const buff = fs.readFileSync("samples/byte_array.bin");
    const result = deserialize(buff);
    const normalized = normalize(result.objects)[0];
    expect(normalized.value).toEqual([1, 2, 3]);
  });
});

describe("printer", () => {
  test("class dump works", () => {
    const buff = fs.readFileSync("samples/vector.bin");
    const result = deserialize(buff);
    const dump = print(result.classes);
    expect(dump).toContain("class java.util.Vector");
  });
});
