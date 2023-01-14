// port of https://github.com/unsynchronized/jdeserialize (public domain)

export enum ClassDescriptionType {
  NORMALCLASS = 0,
  PROXYCLASS = 1,
}

export enum Constants {
  STREAM_MAGIC = 0xaced,
  STREAM_VERSION = 0x05,

  TC_BASE = 0x70,
  TC_NULL = 0x70,
  TC_REFERENCE = 0x71,
  TC_CLASSDESC = 0x72,
  TC_OBJECT = 0x73,
  TC_STRING = 0x74,
  TC_ARRAY = 0x75,
  TC_CLASS = 0x76,
  TC_BLOCKDATA = 0x77,
  TC_ENDBLOCKDATA = 0x78,
  TC_RESET = 0x79,
  TC_BLOCKDATALONG = 0x7a,
  TC_EXCEPTION = 0x7b,
  TC_LONGSTRING = 0x7c,
  TC_PROXYCLASSDESC = 0x7d,
  TC_ENUM = 0x7e,
  TC_MAX = 0x7e,

  BASE_WIRE_HANDLE = 0x7e0000,

  SC_WRITE_METHOD = 0x01,
  SC_BLOCK_DATA = 0x08,
  SC_SERIALIZABLE = 0x02,
  SC_EXTERNALIZABLE = 0x04,
  SC_ENUM = 0x10,
}

export abstract class Content {
  readonly handle: number;
  readonly contentType: string;
  isExceptionObject: boolean;
  constructor(handle: number, contentType: string) {
    this.handle = handle;
    this.contentType = contentType;
    this.isExceptionObject = false;
  }
}

export enum FieldType {
  BYTE = "B",
  CHAR = "C",
  DOUBLE = "D",
  FLOAT = "F",
  INTEGER = "I",
  LONG = "J",
  SHORT = "S",
  BOOLEAN = "Z",
  ARRAY = "[",
  OBJECT = "L",
}

const PRIMITIVE_TYPES = [
  FieldType.BYTE,
  FieldType.CHAR,
  FieldType.DOUBLE,
  FieldType.FLOAT,
  FieldType.INTEGER,
  FieldType.LONG,
  FieldType.SHORT,
  FieldType.BOOLEAN,
];

const invertedType: Map<FieldType, string> = new Map([
  [FieldType.BYTE, "byte"],
  [FieldType.CHAR, "char"],
  [FieldType.DOUBLE, "double"],
  [FieldType.FLOAT, "float"],
  [FieldType.INTEGER, "int"],
  [FieldType.LONG, "long"],
  [FieldType.SHORT, "short"],
  [FieldType.BOOLEAN, "boolean"],
]);

export const invertType = (type: FieldType): string => {
  if (invertedType.has(type)) {
    return invertedType.get(type);
  }
  return "unknown";
};

function decodeClassName(name: string, convertSlashes = true) {
  name = name.substring(1, name.length - 1);
  if (convertSlashes) name = name.replace(/\//g, ".");
  return name;
}

export function resolveJavaType(type: string, className: string) {
  if (type == "L") {
    return decodeClassName(className);
  } else if (type == "[") {
    let suffix = "";
    for (let i = 0; i < className.length; i++) {
      const ch = className[i];
      switch (ch) {
        case "[":
          suffix += "[]";
          continue;
        case "L":
          return decodeClassName(className.substring(i)) + suffix;
        default:
          return invertType(ch as FieldType) + suffix;
      }
    }

    return className;
  }
  return invertType(type as FieldType);
}

class Field {
  name: string;
  type: FieldType;
  className: string;

  isInnerClassReference: boolean;

  constructor(name: string, type: FieldType, className: string) {
    this.name = name;
    this.type = type;
    this.className = className;
    this.isInnerClassReference = false;
  }

  setReferenceTypeName(newname: string) {
    if (this.type != FieldType.OBJECT) {
      throw new Error("can't fix up a non-reference field!");
    }
    const nname = "L" + newname.replace(/\./g, "/") + ";";
    this.className = nname;
  }

  getJavaType(): string {
    return resolveJavaType(this.type, this.className);
  }
}

export class BlockData extends Content {
  readonly data: Buffer;
  constructor(handle: number, data: Buffer) {
    super(handle, "block");
    this.data = data;
  }
}

export class Instance extends Content {
  classDescription: ClassDescription;
  fieldData: Map<string, Map<string, unknown>>;
  annotations: Map<string, Content[]>;
  constructor(handle: number) {
    super(handle, "instance");
    this.fieldData = new Map<string, Map<string, unknown>>();
    this.annotations = new Map<string, Content[]>();
  }
  addFieldData(className: string, fieldName: string, value: unknown) {
    if (!this.fieldData.has(className)) {
      this.fieldData.set(className, new Map<string, unknown>());
    }

    this.fieldData.get(className).set(fieldName, value);
  }
}

export class StringContent extends Content {
  readonly data: string;
  constructor(handle: number, data: string) {
    super(handle, "string");
    this.data = data;
  }
}

export class ArrayContent extends Content {
  data: unknown[];
  className: string;

  constructor(handle: number, className: string, data: unknown[]) {
    super(handle, "array");
    this.className = className;
    this.data = data;
  }
}

export class EnumContent extends Content {
  classDescription: ClassDescription;
  value: string;

  constructor(
    handle: number,
    classDescription: ClassDescription,
    value: string
  ) {
    super(handle, "enum");
    this.classDescription = classDescription;
    this.value = value;
  }
}

export class ClassDescription extends Content {
  type: ClassDescriptionType;
  name: string;
  serialVersionUID: bigint;
  flags: number;
  fields: Field[];
  innerClasses: ClassDescription[];
  annotations: Content[];
  superClass: ClassDescription;
  interfaces: string[];
  enumConstants: Set<string>;
  isInnerClass: boolean;
  isLocalInnerClass: boolean;
  isStaticMemberClass: boolean;

  constructor(handle: number, type: ClassDescriptionType) {
    super(handle, "class");
    this.type = type;
    this.enumConstants = new Set<string>();
    this.innerClasses = [];
    this.annotations = [];
    this.interfaces = [];
    this.fields = [];
    this.isInnerClass = false;
    this.isLocalInnerClass = false;
    this.isStaticMemberClass = false;
  }

  addEnum(data: string) {
    this.enumConstants.add(data);
  }

  isArrayClass(): boolean {
    if (this.name != null && this.name.length > 1 && this.name[0] == "[") {
      return true;
    } else {
      return false;
    }
  }

  addInnerClass(cd: ClassDescription) {
    this.innerClasses.push(cd);
  }

  getHierarchy(): ClassDescription[] {
    let result: ClassDescription[] = [];

    if (
      this.superClass != null &&
      this.superClass.type !== ClassDescriptionType.PROXYCLASS
    ) {
      result = result.concat(this.superClass.getHierarchy());
    }

    result.push(this);

    return result;
  }
}

class Deserializer {
  readonly data: Buffer;
  idx: number;
  currentHandle: number;
  handles: Map<number, Content>;
  classDescriptions: ClassDescription[];

  constructor(data: Buffer) {
    this.data = data;
    this.idx = 0;
    this.currentHandle = Constants.BASE_WIRE_HANDLE;
    this.handles = new Map<number, Content>();
    this.classDescriptions = [];
  }

  hasMoreContent(): boolean {
    return this.idx < this.data.length;
  }

  readByte(): number {
    const val = this.data.readUInt8(this.idx);
    this.idx += 1;
    return val;
  }

  readChar(): string {
    return String.fromCharCode(this.readShort());
  }

  readBoolean(): boolean {
    return this.readByte() != 0;
  }

  readDouble(): number {
    const val = this.data.readDoubleBE(this.idx);
    this.idx += 8;
    return val;
  }

  readFloat(): number {
    const val = this.data.readFloatBE(this.idx);
    this.idx += 4;
    return val;
  }

  readShort(): number {
    const val = this.data.readUint16BE(this.idx);
    this.idx += 2;
    return val;
  }

  readInt(): number {
    const val = this.data.readUInt32BE(this.idx);
    this.idx += 4;
    return val;
  }

  readBlockData(tc: number): BlockData {
    let size = -1;
    if (tc == Constants.TC_BLOCKDATA) {
      size = this.readByte();
    } else if (tc == Constants.TC_BLOCKDATALONG) {
      size = this.readInt();
    }

    if (size < 0) throw new Error("Invalid value for blockdata size: size");

    const value = this.data.subarray(this.idx, this.idx + size);
    this.idx += size;
    return new BlockData(null, value);
  }

  newHandle() {
    return this.currentHandle++;
  }

  saveHandle(handle: number, content: Content) {
    this.handles.set(handle, content);
  }

  readClassDesc(): ClassDescription {
    const tc = this.readByte();
    return this.handleClassDesc(tc, false);
  }

  readString() {
    const length = this.readShort();
    const value = this.data
      .subarray(this.idx, this.idx + length)
      .toString("utf8");
    this.idx += length;
    return value;
  }

  readLong() {
    const value = this.data.readBigInt64BE(this.idx);
    this.idx += 8;
    return value;
  }

  readPrevObject(): Content {
    const handle = this.readInt();
    if (!this.handles.has(handle)) {
      throw new Error("Failure finding an entry for handle: " + handle);
    }
    return this.handles.get(handle);
  }

  readNewString(tc): StringContent {
    if (tc === Constants.TC_REFERENCE) {
      return this.readPrevObject() as StringContent;
    }

    const handle = this.newHandle();
    let length = 0;

    if (tc === Constants.TC_STRING) {
      length = this.readShort();
    } else if (tc === Constants.TC_LONGSTRING) {
      throw new Error("readNewString TC_LONGSTRING not implemented");
    } else if (tc === Constants.TC_NULL) {
      throw new Error("stream signaled TC_NULL when string type expected!");
    } else {
      throw new Error("invalid tc byte in string: " + tc);
    }

    const content = this.data.subarray(this.idx, this.idx + length);
    this.idx += length;

    const stringContent = new StringContent(handle, content.toString("utf8"));
    this.saveHandle(handle, stringContent);

    return stringContent;
  }

  reset() {
    if (this.handles != null && this.handles.size > 0) {
      // put them somewhere
    }
    this.handles.clear();
    this.currentHandle = Constants.BASE_WIRE_HANDLE;
  }

  readClassAnnotation() {
    const annotations: Content[] = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const tc = this.readByte();
      if (tc === Constants.TC_ENDBLOCKDATA) {
        return annotations;
      }
      if (tc === Constants.TC_RESET) {
        this.reset();
        continue;
      }
      const c = this.readContent(tc, true);
      annotations.push(c);
    }
  }

  handleClassDesc(tc: number, mustBeNew = true): ClassDescription {
    if (tc === Constants.TC_CLASSDESC) {
      const name = this.readString();
      const serialVersionUID = this.readLong();
      const handle = this.newHandle();
      const flags = this.readByte();
      const numberOfFields = this.readShort();

      if (numberOfFields < 0)
        throw new Error("Invalid number of fields: " + numberOfFields);

      const fields: Field[] = [];

      for (let i = 0; i < numberOfFields; i++) {
        const ftype = String.fromCharCode(this.readByte());

        if (PRIMITIVE_TYPES.includes(ftype as FieldType)) {
          const fname = this.readString();
          fields.push(new Field(fname, ftype as FieldType, null));
        } else if (
          [FieldType.OBJECT, FieldType.ARRAY].includes(ftype as FieldType)
        ) {
          const fname = this.readString();
          const stc = this.readByte();
          const className = this.readNewString(stc);

          fields.push(new Field(fname, ftype as FieldType, className.data));
        } else {
          throw new Error("invalid field type: " + ftype);
        }
      }

      const classdesc = new ClassDescription(
        handle,
        ClassDescriptionType.NORMALCLASS
      );
      classdesc.name = name;
      classdesc.serialVersionUID = serialVersionUID;
      classdesc.flags = flags;
      classdesc.fields = fields;
      classdesc.annotations = this.readClassAnnotation();
      classdesc.superClass = this.readClassDesc();

      this.saveHandle(handle, classdesc);
      this.classDescriptions.push(classdesc);
      return classdesc;
    } else if (tc === Constants.TC_NULL) {
      if (mustBeNew) {
        throw new Error("Expected new class description, got null!");
      }
      return null;
    } else if (tc === Constants.TC_REFERENCE) {
      if (mustBeNew) {
        throw new Error("Expected new class description, got a reference!");
      }
      const classdesc = this.readPrevObject() as ClassDescription;
      return classdesc;
    } else if (tc === Constants.TC_PROXYCLASSDESC) {
      const handle = this.newHandle();
      const icount = this.readInt();

      if (icount < 0) {
        throw new Error("Invalid proxy interface count: " + icount);
      }

      const interfaces: string[] = [];
      for (let i = 0; i < icount; i++) interfaces.push(this.readString());

      const classdesc = new ClassDescription(
        handle,
        ClassDescriptionType.PROXYCLASS
      );
      classdesc.name = "(proxy class; no name)";
      classdesc.interfaces = interfaces;
      classdesc.superClass = this.readClassDesc();

      this.saveHandle(handle, classdesc);
      return classdesc;
    } else {
      throw new Error("Expected a valid class description starter, got: " + tc);
    }
  }

  readNewEnum(): EnumContent {
    const cd = this.readClassDesc();
    const handle = this.newHandle();

    const tc = this.readByte();
    const so = this.readNewString(tc);

    this.saveHandle(handle, so);

    cd.addEnum(so.data);
    return new EnumContent(handle, cd, so.data);
  }

  readFieldValue(type: string) {
    switch (type) {
      case FieldType.BYTE:
        return this.readByte();
      case FieldType.CHAR:
        return this.readChar();
      case FieldType.DOUBLE:
        return this.readDouble();
      case FieldType.FLOAT:
        return this.readFloat();
      case FieldType.INTEGER:
        return this.readInt();
      case FieldType.LONG:
        return this.readLong();
      case FieldType.SHORT:
        return this.readShort();
      case FieldType.BOOLEAN:
        return this.readBoolean();
      case FieldType.ARRAY:
      case FieldType.OBJECT: {
        const stc = this.readByte();
        return this.readContent(stc, false);
      }
      default:
        throw new Error("readFieldValue: Cannot process type: " + type);
    }
  }

  readClassData(instance: Instance) {
    instance.classDescription.getHierarchy().forEach((clazz) => {
      if ((clazz.flags & Constants.SC_SERIALIZABLE) != 0) {
        clazz.fields.forEach((field) => {
          const value = this.readFieldValue(field.type);
          instance.addFieldData(clazz.name, field.name, value);
        });

        if ((clazz.flags & Constants.SC_WRITE_METHOD) != 0) {
          if ((clazz.flags & Constants.SC_ENUM) != 0) {
            throw new Error("SC_ENUM & SC_WRITE_METHOD encountered!");
          }

          instance.annotations.set(clazz.name, this.readClassAnnotation());
        }
      } else if ((clazz.flags & Constants.SC_EXTERNALIZABLE) != 0) {
        if ((clazz.flags & Constants.SC_BLOCK_DATA) != 0) {
          throw new Error(
            "hit externalizable with nonzero SC_BLOCK_DATA; can't interpret data"
          );
        } else {
          instance.annotations.set(clazz.name, this.readClassAnnotation());
        }
      }
    });
  }

  readNewObject(): Instance {
    const description = this.readClassDesc();
    const handle = this.newHandle();

    const instance = new Instance(handle);
    instance.classDescription = description;

    this.saveHandle(handle, instance);
    this.readClassData(instance);

    return instance;
  }

  readArrayValues(type): unknown[] {
    const size = this.readInt();
    const values = [];
    for (let i = 0; i < size; i++) {
      values.push(this.readFieldValue(type));
    }
    return values;
  }

  readNewArray(): ArrayContent {
    const cd = this.readClassDesc();
    const handle = this.newHandle();
    const values = this.readArrayValues(cd.name.substring(1, 2));
    const ac = new ArrayContent(handle, cd.name, values);
    this.saveHandle(handle, ac);
    return ac;
  }

  readNewClass(): ClassDescription {
    const tc = this.readByte();
    return this.handleClassDesc(tc, true);
  }

  readException(): Content {
    this.reset();
    const tc = this.readByte();
    if (tc == Constants.TC_RESET) {
      throw new Error(
        "TC_RESET for object while reading exception: what should we do?"
      );
    }
    const c = this.readContent(tc, false);
    if (c == null) {
      throw new Error(
        "stream signaled for an exception, but exception object was null!"
      );
    }
    if (!(c instanceof Instance)) {
      throw new Error(
        "stream signaled for an exception, but content is not an object!"
      );
    }

    if (c.isExceptionObject) {
      throw new Error("serialized exception read during stream");
    }
    c.isExceptionObject = true;
    this.reset();
    return c;
  }

  readContent(tc: number, blockData: boolean): Content | null {
    switch (tc) {
      case Constants.TC_NULL:
        return null;
      case Constants.TC_CLASS:
        return this.readNewClass();
      case Constants.TC_OBJECT:
        return this.readNewObject();
      case Constants.TC_ARRAY:
        return this.readNewArray();
      case Constants.TC_ENUM:
        return this.readNewEnum();
      case Constants.TC_STRING:
      case Constants.TC_LONGSTRING:
        return this.readNewString(tc);
      case Constants.TC_REFERENCE:
        return this.readPrevObject();
      case Constants.TC_BLOCKDATA:
      case Constants.TC_BLOCKDATALONG:
        if (blockData == false) {
          throw new Error("got a blockdata TC_*, but not allowed here: " + tc);
        }
        return this.readBlockData(tc);
      case Constants.TC_EXCEPTION:
        return this.readException();
      case Constants.TC_CLASSDESC:
      case Constants.TC_PROXYCLASSDESC:
        return this.handleClassDesc(tc);
      default:
        throw new Error("Unknown content tc byte in stream: " + tc);
    }
  }

  deserialize(): Content[] {
    const magic = this.readShort();

    if (magic !== Constants.STREAM_MAGIC)
      throw new Error(
        "Magic mismatch! expected " + Constants.STREAM_MAGIC + ", got " + magic
      );

    const version = this.readShort();

    if (version !== Constants.STREAM_VERSION)
      throw new Error(
        "Version mismatch! expected " +
          Constants.STREAM_VERSION +
          ", got " +
          version
      );

    const objects: Content[] = [];

    while (this.hasMoreContent()) {
      const tc = this.readByte();
      const content = this.readContent(tc, true);

      if (content != null) {
        objects.push(content);
      }
    }

    return objects;
  }

  connectMemberClasses() {
    const newnames = new Map<ClassDescription, string>();
    const classes = new Map<string, ClassDescription>();
    const classnames = new Set<string>();

    this.handles.forEach((c) => {
      if (!(c instanceof ClassDescription)) {
        return;
      }
      const cd = c as ClassDescription;
      classes.set(cd.name, cd);
      classnames.add(cd.name);
    });

    const fpat = new RegExp("^this\\$(\\d+)$");
    const clpat = new RegExp("^((?:[^\\$]+\\$)*[^\\$]+)\\$([^\\$]+)$");

    classes.forEach((cd) => {
      if (cd.type == ClassDescriptionType.PROXYCLASS) {
        return;
      }

      cd.fields.forEach((f) => {
        if (f.type != "L") {
          return;
        }

        if (!fpat.test(f.name)) {
          return;
        }
        const islocal = false;
        const clmat = cd.name.match(clpat);
        if (clmat === null) {
          throw new Error(
            "inner class enclosing-class reference field exists, but class name doesn't match expected pattern: class " +
              cd.name +
              " field " +
              f.name
          );
        }
        const outer = clmat[1],
          inner = clmat[2];
        const outercd = classes.get(outer);
        if (outercd == null) {
          throw new Error(
            "couldn't connect inner classes: outer class not found for field name " +
              f.name
          );
        }
        if (outercd.name !== f.getJavaType()) {
          throw new Error(
            "outer class field type doesn't match field type name: " +
              f.className +
              " outer class name " +
              outercd.name
          );
        }
        outercd.addInnerClass(cd);
        cd.isLocalInnerClass = islocal;
        cd.isInnerClass = true;
        f.isInnerClassReference = true;
        newnames.set(cd, inner);
      });
    });

    classes.forEach((cd) => {
      if (cd.type == ClassDescriptionType.PROXYCLASS) {
        return;
      }
      if (cd.isInnerClass) {
        return;
      }

      const clmat = cd.name.match(clpat);
      if (clmat === null) {
        return;
      }
      const outer = clmat[1],
        inner = clmat[2];
      const outercd = classes.get(outer);
      if (outercd != null) {
        outercd.addInnerClass(cd);
        cd.isStaticMemberClass = true;
        newnames.set(cd, inner);
      }
    });

    newnames.forEach((newname, ncd) => {
      if (classnames.has(newname)) {
        throw new Error(
          "can't rename class from " +
            ncd.name +
            " to " +
            newname +
            " -- class already exists!"
        );
      }

      classes.forEach((cd) => {
        if (cd.type == ClassDescriptionType.PROXYCLASS) {
          return;
        }

        cd.fields.forEach((f) => {
          if (f.getJavaType() === ncd.name) {
            f.setReferenceTypeName(newname);
          }
        });
      });

      if (classnames.delete(ncd.name) == false) {
        throw new Error(
          "tried to remove " +
            ncd.name +
            " from classnames cache, but couldn't find it!"
        );
      }
      ncd.name = newname;

      if (classnames.has(newname)) {
        throw new Error(
          "can't rename class to " + newname + " -- class already exists!"
        );
      }

      classnames.add(newname);
    });
  }
}

type DeserializationResult = {
  objects: Content[];
  classes: ClassDescription[];
};

export function deserialize(
  data: Buffer,
  connect = true
): DeserializationResult {
  const d = new Deserializer(data);
  const objects = d.deserialize();

  if (connect) {
    d.connectMemberClasses();
  }

  return {
    objects: objects,
    classes: d.classDescriptions,
  };
}
