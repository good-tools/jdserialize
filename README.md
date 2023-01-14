# jdserialize

jdserialize is a JavaScript port of https://github.com/unsynchronized/jdeserialize with an added object normalizer for easier data interpretation.

Demo it on [good.tools](https://good.tools/java-deserialize).

## Usage

```javascript
import { deserialize, normalize, print } from "@goodtools/jdserialize";

const buf = Buffer.from([
  0xac, 0xed, 0x00, 0x05, 0x73, 0x72, 0x00, 0x1a, 0x74, 0x6f, 0x6f, 0x6c, 0x73,
  0x2e, 0x67, 0x6f, 0x6f, 0x64, 0x2e, 0x6d, 0x6f, 0x64, 0x65, 0x6c, 0x2e, 0x42,
  0x79, 0x74, 0x65, 0x41, 0x72, 0x72, 0x61, 0x79, 0x42, 0xdd, 0xd3, 0x7e, 0xd6,
  0xd6, 0xb2, 0x45, 0x02, 0x00, 0x01, 0x5b, 0x00, 0x05, 0x76, 0x61, 0x6c, 0x75,
  0x65, 0x74, 0x00, 0x02, 0x5b, 0x42, 0x78, 0x70, 0x75, 0x72, 0x00, 0x02, 0x5b,
  0x42, 0xac, 0xf3, 0x17, 0xf8, 0x06, 0x08, 0x54, 0xe0, 0x02, 0x00, 0x00, 0x78,
  0x70, 0x00, 0x00, 0x00, 0x03, 0x01, 0x02, 0x03,
]);

const deserialized = deserialize(buf);
```

The example serialized object was created using
```java
package tools.good.model;

import java.io.Serializable;

public class ByteArray implements Serializable {
    public byte[] value;
}
```

```java
ByteArray obj = new ByteArray();
obj.value = new byte[]{ 0x01, 0x02, 0x03 };

// serialize obj
```

### Normalization

```javascript
const normalized = normalize(deserialized.objects);
const serialized = JSON.stringify(normalized); // [{"value": [1, 2, 3]}]
```

```json
[
  {
    "value": [
      1,
      2,
      3
    ]
  }
]
```

### Class Dump
```javascript
const classDump = print(deserialized.classes);
console.log(classDump);
```

```java
// handle: 7e0000
class tools.good.model.ByteArray implements java.io.Serializable {
  static final long serialVersionUID = 4818239718080033349L;

  byte[] value;
}
```