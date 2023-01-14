import {
  ArrayContent,
  BlockData,
  Content,
  EnumContent,
  Instance,
  StringContent,
} from "./deserializer";

abstract class ObjectNormalizer {
  abstract matches(instance: Instance): boolean;
  abstract normalize(
    normalizer: Normalizer,
    instance: Instance,
    history: Set<number>
  ): unknown;
}

class WrappedPrimitiveNormalizer extends ObjectNormalizer {
  matches(instance: Instance): boolean {
    return [
      "java.lang.Integer",
      "java.lang.Long",
      "java.lang.Boolean",
      "java.lang.Float",
      "java.lang.Byte",
      "java.lang.Short",
      "java.lang.Double",
      "java.lang.Character",
    ].includes(instance.classDescription.name);
  }

  normalize(
    normalizer: Normalizer,
    instance: Instance,
    history: Set<number>
  ): unknown {
    let data = null;
    instance.fieldData.forEach((fields) => {
      if (fields.has("value")) {
        data = fields.get("value");
      }
    });
    return normalizer.contentValue(data, history);
  }
}

class VectorNormalizer extends ObjectNormalizer {
  matches(instance: Instance): boolean {
    return instance.classDescription.name === "java.util.Vector";
  }
  normalize(
    normalizer: Normalizer,
    instance: Instance,
    history: Set<number>
  ): unknown {
    const data = [];
    if (instance.fieldData.has("java.util.Vector")) {
      const v = instance.fieldData.get("java.util.Vector");
      for (let i = 0; i < v.get("elementCount"); i++) {
        data.push(
          normalizer.contentValue(
            (v.get("elementData") as ArrayContent).data[i],
            history
          )
        );
      }
    }
    return data;
  }
}

class MapNormalizer extends ObjectNormalizer {
  matches(instance: Instance): boolean {
    return [
      "java.util.HashMap",
      "java.util.TreeMap",
      "java.util.LinkedHashMap",
    ].includes(instance.classDescription.name);
  }
  normalize(
    normalizer: Normalizer,
    instance: Instance,
    history: Set<number>
  ): unknown {
    const data = [];
    instance.annotations.forEach((values) => {
      values.forEach((value) => {
        if (!(value instanceof BlockData)) {
          data.push(normalizer.contentValue(value, history));
        }
      });
    });

    const result = {};

    // [ k1, v1, k2, v2, ... , kn, vn ]
    for (let i = 0; i < data.length; i += 2) {
      result[data[i]] = data[i + 1];
    }

    return result;
  }
}

class ListNormalizer extends ObjectNormalizer {
  matches(instance: Instance): boolean {
    return [
      "java.util.ArrayList",
      "java.util.LinkedList",
      "java.util.ArrayDeque",
      "java.util.concurrent.ConcurrentLinkedQueue",
    ].includes(instance.classDescription.name);
  }
  normalize(
    normalizer: Normalizer,
    instance: Instance,
    history: Set<number>
  ): unknown {
    const data = [];
    instance.annotations.forEach((values) => {
      values.forEach((value) => {
        if (!(value instanceof BlockData)) {
          data.push(normalizer.contentValue(value, history));
        }
      });
    });
    return data;
  }
}

class Normalizer {
  objects: Content[];
  normalizers: ObjectNormalizer[];

  constructor(objects: Content[]) {
    this.objects = objects;

    this.normalizers = [
      new VectorNormalizer(),
      new ListNormalizer(),
      new MapNormalizer(),
      new WrappedPrimitiveNormalizer(),
    ];
  }

  contentValue(value: unknown, history: Set<number>): unknown {
    const currentHistory = new Set<number>(history);

    // prevent cycles
    if (value instanceof Content) {
      const handle = (value as Content).handle;
      if (currentHistory.has(handle)) {
        return `<cycle-ref-${handle}>`;
      }
      currentHistory.add(handle);
    }

    if (value instanceof Instance) {
      return this.normalizeObject(value, currentHistory);
    } else if (value instanceof StringContent) {
      return (value as StringContent).data;
    } else if (value instanceof ArrayContent) {
      const values = [];
      (value as ArrayContent).data.forEach((d) => {
        values.push(this.contentValue(d, currentHistory));
      });
      return values;
    } else if (value instanceof EnumContent) {
      return (value as EnumContent).value;
    } else if (typeof value === "bigint") {
      return (value as bigint).toString(10);
    }
    return value;
  }

  /**
   * Try to find a suitable representation of this content
   *
   * @param content
   * @returns either an array or an object
   */
  normalizeObject(content: Content, history: Set<number>): unknown {
    if (!(content instanceof Instance)) {
      return null;
    }

    const instance = content as Instance;

    // run defined normalizers
    for (const normalizer of this.normalizers) {
      if (normalizer.matches(instance)) {
        return normalizer.normalize(this, instance, history);
      }
    }

    const fieldData = {};

    instance.fieldData.forEach((fields) => {
      fields.forEach((v, k) => {
        fieldData[k] = this.contentValue(v, history);
      });
    });

    return fieldData;
  }

  normalize() {
    const normalized = [];
    this.objects.forEach((obj) => {
      const o = this.normalizeObject(obj, new Set<number>());
      if (o != null) normalized.push(o);
    });

    return normalized;
  }
}

export function normalize(objects: Content[]): unknown {
  return new Normalizer(objects).normalize();
}
