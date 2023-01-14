import {
  ClassDescription,
  ClassDescriptionType,
  Constants,
  resolveJavaType,
} from "./deserializer";

function indent(level: number) {
  let buf = "";
  for (let i = 0; i < level; i++) {
    buf += "  ";
  }
  return buf;
}

class Printer {
  buffer: string;
  constructor() {
    this.buffer = "";
  }
  println(content: string) {
    this.buffer += content + "\n";
  }
  print(content: string) {
    this.buffer += content;
  }
}

class ClassPrinter {
  classDescriptions: ClassDescription[];

  constructor(classDescriptions: ClassDescription[]) {
    this.classDescriptions = classDescriptions;
  }

  dumpAll(): string {
    const printer = new Printer();
    this.classDescriptions.forEach((cd) => {
      if (cd.isArrayClass()) {
        return;
      }

      // Member classes will be displayed as part of their enclosing
      // classes.
      if (cd.isStaticMemberClass || cd.isInnerClass) {
        return;
      }

      printer.println("// handle: " + cd.handle.toString(16));
      this.dump(0, cd, printer);
      printer.println("");
    });
    return printer.buffer;
  }

  dump(indentlevel: number, cd: ClassDescription, ps: Printer) {
    const classname = cd.name;

    if (cd.annotations != null && cd.annotations.length > 0) {
      ps.println(indent(indentlevel) + "// annotations: ");

      cd.annotations.forEach((c) => {
        ps.print(indent(indentlevel) + "// " + indent(1));
        ps.println(c.toString());
      });
    }
    if (cd.type == ClassDescriptionType.NORMALCLASS) {
      if ((cd.flags & Constants.SC_ENUM) != 0) {
        ps.print(indent(indentlevel) + "enum " + classname + " {");

        if (cd.enumConstants.size > 0) {
          ps.println("");
          ps.print(
            indent(indentlevel + 1) +
              Array.from(cd.enumConstants).join(
                ",\n" + indent(indentlevel + 1)
              ) +
              ";"
          );
        }

        ps.println("");
        ps.println(indent(indentlevel) + "}");
        return;
      }
      ps.print(indent(indentlevel));
      if (cd.isStaticMemberClass) {
        ps.print("static ");
      }
      ps.print(
        "class " +
          (classname.charAt(0) == "["
            ? resolveJavaType(classname.charAt(0), cd.name)
            : classname)
      );
      if (cd.superClass != null) {
        ps.print(" extends " + cd.superClass.name);
      }
      ps.print(" implements ");
      if ((cd.flags & Constants.SC_EXTERNALIZABLE) != 0) {
        ps.print("java.io.Externalizable");
      } else {
        ps.print("java.io.Serializable");
      }
      if (cd.interfaces != null) {
        cd.interfaces.forEach((intf) => {
          ps.print(", " + intf);
        });
      }
      ps.println(" {");

      ps.println(
        indent(indentlevel + 1) +
          "static final long serialVersionUID = " +
          cd.serialVersionUID.toString(10) +
          "L;"
      );
      ps.println("");

      cd.innerClasses.forEach((icd) => {
        this.dump(indentlevel + 1, icd, ps);
        ps.println("");
      });

      cd.fields.forEach((f) => {
        if (f.isInnerClassReference) {
          return;
        }
        ps.print(
          indent(indentlevel + 1) + resolveJavaType(f.type, f.className)
        );
        ps.println(" " + f.name + ";");
      });

      ps.println(indent(indentlevel) + "}");
    } else if (cd.type == ClassDescriptionType.PROXYCLASS) {
      ps.print(
        indent(indentlevel) + "// proxy class " + cd.handle.toString(16)
      );
      if (cd.superClass != null) {
        ps.print(" extends " + cd.superClass.name);
      }
      ps.println(" implements ");
      cd.interfaces.forEach((intf) => {
        ps.println(indent(indentlevel) + "//    " + intf + ", ");
      });

      if ((cd.flags & Constants.SC_EXTERNALIZABLE) != 0) {
        ps.println(indent(indentlevel) + "//    java.io.Externalizable");
      } else {
        ps.println(indent(indentlevel) + "//    java.io.Serializable");
      }
    } else {
      throw new Error("encountered invalid classdesc type!");
    }
  }
}

export function print(classes: ClassDescription[]): string {
  return new ClassPrinter(classes).dumpAll();
}
