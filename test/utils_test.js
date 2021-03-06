import { expect } from "chai";

import {
  asNumber,
  dataURItoBlob,
  deepEquals,
  getDefaultFormState,
  isFilesArray,
  isMultiSelect,
  mergeObjects,
  pad,
  parseDateString,
  retrieveSchema,
  shouldRender,
  toDateString,
  toIdSchema,
} from "../src/utils";

describe("utils", () => {
  describe("getDefaultFormState()", () => {
    describe("root default", () => {
      it("should map root schema default to form state, if any", () => {
        expect(
          getDefaultFormState({
            type: "string",
            default: "foo",
          })
        ).to.eql("foo");
      });
    });

    describe("nested default", () => {
      it("should map schema object prop default to form state", () => {
        expect(
          getDefaultFormState({
            type: "object",
            properties: {
              string: {
                type: "string",
                default: "foo",
              },
            },
          })
        ).to.eql({ string: "foo" });
      });

      it("should default to empty object if no properties are defined", () => {
        expect(
          getDefaultFormState({
            type: "object",
          })
        ).to.eql({});
      });

      it("should recursively map schema object default to form state", () => {
        expect(
          getDefaultFormState({
            type: "object",
            properties: {
              object: {
                type: "object",
                properties: {
                  string: {
                    type: "string",
                    default: "foo",
                  },
                },
              },
            },
          })
        ).to.eql({ object: { string: "foo" } });
      });

      it("should map schema array default to form state", () => {
        expect(
          getDefaultFormState({
            type: "object",
            properties: {
              array: {
                type: "array",
                default: ["foo", "bar"],
                items: {
                  type: "string",
                },
              },
            },
          })
        ).to.eql({ array: ["foo", "bar"] });
      });

      it("should recursively map schema array default to form state", () => {
        expect(
          getDefaultFormState({
            type: "object",
            properties: {
              object: {
                type: "object",
                properties: {
                  array: {
                    type: "array",
                    default: ["foo", "bar"],
                    items: {
                      type: "string",
                    },
                  },
                },
              },
            },
          })
        ).to.eql({ object: { array: ["foo", "bar"] } });
      });

      it("should propagate nested defaults to resulting formData by default", () => {
        const schema = {
          type: "object",
          properties: {
            object: {
              type: "object",
              properties: {
                array: {
                  type: "array",
                  default: ["foo", "bar"],
                  items: {
                    type: "string",
                  },
                },
                bool: {
                  type: "boolean",
                  default: true,
                },
              },
            },
          },
        };
        expect(getDefaultFormState(schema, {})).eql({
          object: { array: ["foo", "bar"], bool: true },
        });
      });

      it("should keep parent defaults if they don't have a node level default", () => {
        const schema = {
          type: "object",
          properties: {
            level1: {
              type: "object",
              default: { level2: { leaf1: 1, leaf2: 1, leaf3: 1, leaf4: 1 } },
              properties: {
                level2: {
                  type: "object",
                  default: {
                    // No level2 default for leaf1
                    leaf2: 2,
                    leaf3: 2,
                  },
                  properties: {
                    leaf1: { type: "number" }, // No level2 default for leaf1
                    leaf2: { type: "number" }, // No level3 default for leaf2
                    leaf3: { type: "number", default: 3 },
                    leaf4: { type: "number" }, // Defined in formData.
                  },
                },
              },
            },
          },
        };
        expect(
          getDefaultFormState(schema, { level1: { level2: { leaf4: 4 } } })
        ).eql({
          level1: { level2: { leaf1: 1, leaf2: 2, leaf3: 3, leaf4: 4 } },
        });
      });

      it("should use parent defaults for ArrayFields", () => {
        const schema = {
          type: "object",
          properties: {
            level1: {
              type: "array",
              default: [1, 2, 3],
              items: { type: "number" },
            },
          },
        };
        expect(getDefaultFormState(schema, {})).eql({ level1: [1, 2, 3] });
      });

      it("should use parent defaults for ArrayFields if declared in parent", () => {
        const schema = {
          type: "object",
          default: { level1: [1, 2, 3] },
          properties: {
            level1: {
              type: "array",
              items: { type: "number" },
            },
          },
        };
        expect(getDefaultFormState(schema, {})).eql({ level1: [1, 2, 3] });
      });

      it("should map item defaults to fixed array default", () => {
        const schema = {
          type: "object",
          properties: {
            array: {
              type: "array",
              items: [
                {
                  type: "string",
                  default: "foo",
                },
                {
                  type: "number",
                },
              ],
            },
          },
        };
        expect(getDefaultFormState(schema, {})).eql({
          array: ["foo", undefined],
        });
      });

      it("should use schema default for referenced definitions", () => {
        const schema = {
          definitions: {
            testdef: {
              type: "object",
              properties: {
                foo: { type: "number" },
              },
            },
          },
          $ref: "#/definitions/testdef",
          default: { foo: 42 },
        };

        expect(getDefaultFormState(schema, undefined, schema.definitions)).eql({
          foo: 42,
        });
      });
    });
  });

  describe("asNumber()", () => {
    it("should return a number out of a string representing a number", () => {
      expect(asNumber("3")).eql(3);
    });

    it("should return a float out of a string representing a float", () => {
      expect(asNumber("3.14")).eql(3.14);
    });

    it("should return the raw value if the input ends with a dot", () => {
      expect(asNumber("3.")).eql("3.");
    });

    it("should not convert the value to an integer if the input ends with a 0", () => {
      // this is to allow users to input 3.07
      expect(asNumber("3.0")).eql("3.0");
    });

    it("should allow numbers with a 0 in the first decimal place", () => {
      expect(asNumber("3.07")).eql(3.07);
    });

    it("should return undefined if the input is empty", () => {
      expect(asNumber("")).eql(undefined);
    });
  });

  describe("isMultiSelect()", () => {
    it("should be true if schema items enum is an array and uniqueItems is true", () => {
      let schema = { items: { enum: ["foo", "bar"] }, uniqueItems: true };
      expect(isMultiSelect(schema)).to.be.true;
    });

    it("should be false if items is undefined", () => {
      const schema = {};
      expect(isMultiSelect(schema)).to.be.false;
    });

    it("should be false if uniqueItems is false", () => {
      const schema = { items: { enum: ["foo", "bar"] }, uniqueItems: false };
      expect(isMultiSelect(schema)).to.be.false;
    });

    it("should be false if schema items enum is not an array", () => {
      const schema = { items: {}, uniqueItems: true };
      expect(isMultiSelect(schema)).to.be.false;
    });
  });

  describe("isFilesArray()", () => {
    it("should be true if items have data-url format", () => {
      const schema = { items: { type: "string", format: "data-url" } };
      const uiSchema = {};
      expect(isFilesArray(schema, uiSchema)).to.be.true;
    });

    it("should be false if items is undefined", () => {
      const schema = {};
      const uiSchema = {};
      expect(isFilesArray(schema, uiSchema)).to.be.false;
    });
  });

  describe("mergeObjects()", () => {
    it("should't mutate the provided objects", () => {
      const obj1 = { a: 1 };
      mergeObjects(obj1, { b: 2 });
      expect(obj1).eql({ a: 1 });
    });

    it("should merge two one-level deep objects", () => {
      expect(mergeObjects({ a: 1 }, { b: 2 })).eql({ a: 1, b: 2 });
    });

    it("should override the first object with the values from the second", () => {
      expect(mergeObjects({ a: 1 }, { a: 2 })).eql({ a: 2 });
    });

    it("should recursively merge deeply nested objects", () => {
      const obj1 = {
        a: 1,
        b: {
          c: 3,
          d: [1, 2, 3],
          e: { f: { g: 1 } },
        },
        c: 2,
      };
      const obj2 = {
        a: 1,
        b: {
          d: [3, 2, 1],
          e: { f: { h: 2 } },
          g: 1,
        },
        c: 3,
      };
      const expected = {
        a: 1,
        b: {
          c: 3,
          d: [3, 2, 1],
          e: { f: { g: 1, h: 2 } },
          g: 1,
        },
        c: 3,
      };
      expect(mergeObjects(obj1, obj2)).eql(expected);
    });

    describe("concatArrays option", () => {
      it("should not concat arrays by default", () => {
        const obj1 = { a: [1] };
        const obj2 = { a: [2] };

        expect(mergeObjects(obj1, obj2)).eql({ a: [2] });
      });

      it("should concat arrays when concatArrays is true", () => {
        const obj1 = { a: [1] };
        const obj2 = { a: [2] };

        expect(mergeObjects(obj1, obj2, true)).eql({ a: [1, 2] });
      });

      it("should concat nested arrays when concatArrays is true", () => {
        const obj1 = { a: { b: [1] } };
        const obj2 = { a: { b: [2] } };

        expect(mergeObjects(obj1, obj2, true)).eql({ a: { b: [1, 2] } });
      });
    });
  });

  describe("retrieveSchema()", () => {
    it("should 'resolve' a schema which contains definitions", () => {
      const schema = { $ref: "#/definitions/address" };
      const address = {
        type: "object",
        properties: {
          street_address: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
        },
        required: ["street_address", "city", "state"],
      };
      const definitions = { address };

      expect(retrieveSchema(schema, definitions)).eql(address);
    });

    it("should throw an Error when a JSON Pointer is not found", () => {
      const schema = { $ref: "#/definitions/address404" };
      const address = {
        type: "object",
        properties: {
          street_address: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
        },
        required: ["street_address", "city", "state"],
      };
      const definitions = { address };
      expect(() => retrieveSchema(schema, definitions)).to.throw(
        `Could not find a definition for #/definitions/address404.`
      );
    });

    it("should throw an Error if a JSON Pointer refers to itself", () => {
      const schema = { $ref: "#/definitions/address" };

      const address = {
        $ref: "#/definitions/address",
      };

      const definitions = { address };
      expect(() => retrieveSchema(schema, definitions)).to.throw(
        `Circular or self reference detected when reading schema for #/definitions/address`
      );
    });

    it("should throw an Error if two JSON Pointers refer to each another ", () => {
      const schema = { $ref: "#/definitions/address1" };

      const address1 = {
        $ref: "#/definitions/address2",
      };

      const address2 = {
        $ref: "#/definitions/address1",
      };

      const definitions = { address1, address2 };
      expect(() => retrieveSchema(schema, definitions)).to.throw(
        `Circular or self reference detected when reading schema for #/definitions/address`
      );
    });

    it("should throw an Error when a JSON Pointer references a JSON Pointer that does not exist", () => {
      const schema = { $ref: "#/definitions/address" };
      const address = {
        $ref: "#/definitions/address2",
      };

      const definitions = { address };
      expect(() => retrieveSchema(schema, definitions)).to.throw(
        `Could not find a definition for #/definitions/address2`
      );
    });

    it("should throw an Error when a JSON pointer references a $id that does not exit", () => {
      const schema = { $ref: "#/definitions/address" };
      const address = {
        $ref: "#address2",
      };

      const definitions = { address };
      expect(() => retrieveSchema(schema, definitions)).to.throw(
        `Could not find a definition for #address2`
      );
    });

    it("should 'resolve' an $id reference resulting from dereferncing a JSON Pointer", () => {
      const schema = { $ref: "#/definitions/address" };
      const addressSpecial = {
        $id: "#address_special",
        type: "object",
        properties: {
          containerId: {
            type: "string",
          },
          pierNo: {
            type: "string",
          },
          wharf: {
            type: "string",
          },
          port: {
            type: "string",
          },
        },
      };
      const address = {
        $ref: "#address_special",
      };
      const definitions = {
        address,
        addressSpecial,
      };
      expect(retrieveSchema(schema, definitions)).eql(addressSpecial);
    });

    it("should throw an Error if a JSON Pointer refers to itself using a $id", () => {
      const schema = { $ref: "#/definitions/address" };

      const address = {
        $id: "#address",
        $ref: "#address",
      };

      const definitions = { address };
      // NOTE: here the error is thrown when the function runs for the third time
      // it runs the first time with the JSON Pointer and the second time with the $id
      // the third time it runs, it finds the id and throws the error using the `$id`
      expect(() => retrieveSchema(schema, definitions)).to.throw(
        `Circular or self reference detected when reading schema for #address`
      );
    });

    it("should 'resolve' a schema which references $ids within definitions", () => {
      const schema = { $ref: "#address" };
      const address = {
        $id: "#address",
        type: "object",
        properties: {
          street_address: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          postcode: { type: "number" },
        },
        required: ["street_address", "city", "state", "postcode"],
      };
      const definitions = {
        address,
      };
      expect(retrieveSchema(schema, definitions)).eql(address);
    });

    it("should throw an Error when a $id is not found", () => {
      const schema = { $ref: "#address404" };
      const address = {
        $id: "#address",
        type: "object",
        properties: {
          street_address: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          postcode: { type: "number" },
        },
        required: ["street_address", "city", "state", "postcode"],
      };
      const definitions = {
        address,
      };
      expect(() => retrieveSchema(schema, definitions)).to.throw(
        `Could not find a definition for #address404.`
      );
    });

    it("should 'resolve' a schema where a $id has a reference to a JSON Pointer", () => {
      const schema = { $ref: "#address" };
      const addressSpecial = {
        type: "object",
        properties: {
          containerId: {
            type: "string",
          },
          pierNo: {
            type: "string",
          },
          wharf: {
            type: "string",
          },
          port: {
            type: "string",
          },
        },
      };
      const address = {
        $id: "#address",
        $ref: "#/definitions/addressSpecial",
      };
      const definitions = {
        address,
        addressSpecial,
      };
      expect(retrieveSchema(schema, definitions)).eql(addressSpecial);
    });

    it("should 'resolve' a schema which has references that are normalized", () => {
      const schema = { $ref: "#address" };
      const address = {
        $id: "#address",
        type: "object",
        properties: {
          street_address: { $ref: "#street_address" },
          city: { $ref: "#city" },
          state: { $ref: "#state" },
          postcode: { $ref: "#postcode" },
        },
        required: ["street_address", "city", "state", "postcode"],
      };
      const definitions = {
        street_address: { $id: "#street_address", type: "string" },
        city: { $id: "#city", type: "string" },
        state: { $id: "#state", type: "string" },
        postcode: { $id: "#postcode", type: "number" },
        address,
      };

      expect(retrieveSchema(schema, definitions)).eql(address);
    });

    it("should throw an Error  when a $id refers to a JSON Pointer which does not exist", () => {
      const schema = { $ref: "#address" };
      const address = {
        $id: "#address",
        $ref: "#/definitions/address2",
        type: "object",
        properties: {
          street_address: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          postcode: { type: "number" },
        },
        required: ["street_address", "city", "state", "postcode"],
      };
      const definitions = {
        address,
      };
      expect(() => retrieveSchema(schema, definitions)).to.throw(
        `Could not find a definition for #/definitions/address2`
      );
    });

    it("should throw an Error when a $id refers to a $id which does not exist", () => {
      const schema = { $ref: "#address" };
      const address = {
        $id: "#address",
        $ref: "#address2",
        type: "object",
        properties: {
          street_address: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          postcode: { type: "number" },
        },
        required: ["street_address", "city", "state", "postcode"],
      };
      const definitions = {
        address,
      };
      expect(() => retrieveSchema(schema, definitions)).to.throw(
        `Could not find a definition for #address2`
      );
    });

    it("should throw an error if an id is self referencing", () => {
      const schema = { $ref: "#object" };
      const definitions = {
        object: {
          type: "string",
          $id: "#object",
          $ref: "#object",
        },
      };
      expect(() => retrieveSchema(schema, definitions)).to.throw(
        `Circular or self reference detected when reading schema for #object`
      );
    });

    it("should throw an error if two ids have circular references", () => {
      const schema = { $ref: "#object1" };

      const definitions = {
        object1: {
          $id: "#object1",
          $ref: "#object2",
        },

        object2: {
          $id: "#object2",
          $ref: "#object1",
        },
      };
      expect(() => retrieveSchema(schema, definitions)).to.throw(
        `Circular or self reference detected when reading schema for #object1`
      );
    });

    it("should throw an Error when a $id refers to itself using a JSON Pointer", () => {
      const schema = { $ref: "#address" };
      const address = {
        $id: "#address",
        $ref: "#/definitions/address",
      };
      const definitions = {
        address,
      };
      expect(() => retrieveSchema(schema, definitions)).to.throw(
        `Circular or self reference detected when reading schema for #/definitions/address`
      );
    });

    it("should throw an Error when a $id and a JSON Pointer refer to each another", () => {
      const schema = { $ref: "#a" };
      const schema2 = { $ref: "#/definitions/b" };
      const a = {
        $id: "#a",
        $ref: "#/definitions/b",
      };
      const b = {
        $ref: "#a",
      };
      const definitions = { a, b };
      // NOTE: error is thrown in the third recursive iteration of the function
      // #a -> #/definitions/b -> #a
      expect(() => retrieveSchema(schema, definitions)).to.throw(
        `Circular or self reference detected when reading schema for #a`
      );

      expect(() => retrieveSchema(schema2, definitions)).to.throw(
        `Circular or self reference detected when reading schema for #/definitions/b`
      );
    });

    it("should 'resolve' escaped JSON Pointers", () => {
      const schema = { $ref: "#/definitions/a~0complex~1name" };
      const address = { type: "string" };
      const definitions = { "a~complex/name": address };

      expect(retrieveSchema(schema, definitions)).eql(address);
    });

    it("should priorize local definitions over foreign ones", () => {
      const schema = {
        $ref: "#/definitions/address",
        title: "foo",
      };
      const address = {
        type: "string",
        title: "bar",
      };
      const definitions = { address };

      expect(retrieveSchema(schema, definitions)).eql({
        ...address,
        title: "foo",
      });
    });
  });

  describe("shouldRender", () => {
    describe("single level comparison checks", () => {
      const initial = { props: { myProp: 1 }, state: { myState: 1 } };

      it("should detect equivalent props and state", () => {
        expect(shouldRender(initial, { myProp: 1 }, { myState: 1 })).eql(false);
      });

      it("should detect diffing props", () => {
        expect(shouldRender(initial, { myProp: 2 }, { myState: 1 })).eql(true);
      });

      it("should detect diffing state", () => {
        expect(shouldRender(initial, { myProp: 1 }, { myState: 2 })).eql(true);
      });

      it("should handle equivalent function prop", () => {
        const fn = () => {};
        expect(
          shouldRender(
            { props: { myProp: fn }, state: { myState: 1 } },
            { myProp: fn },
            { myState: 1 }
          )
        ).eql(false);
      });
    });

    describe("nested levels comparison checks", () => {
      const initial = {
        props: { myProp: { mySubProp: 1 } },
        state: { myState: { mySubState: 1 } },
      };

      it("should detect equivalent props and state", () => {
        expect(
          shouldRender(
            initial,
            { myProp: { mySubProp: 1 } },
            { myState: { mySubState: 1 } }
          )
        ).eql(false);
      });

      it("should detect diffing props", () => {
        expect(
          shouldRender(
            initial,
            { myProp: { mySubProp: 2 } },
            { myState: { mySubState: 1 } }
          )
        ).eql(true);
      });

      it("should detect diffing state", () => {
        expect(
          shouldRender(
            initial,
            { myProp: { mySubProp: 1 } },
            { myState: { mySubState: 2 } }
          )
        ).eql(true);
      });

      it("should handle equivalent function prop", () => {
        const fn = () => {};
        expect(
          shouldRender(
            {
              props: { myProp: { mySubProp: fn } },
              state: { myState: { mySubState: fn } },
            },
            { myProp: { mySubProp: fn } },
            { myState: { mySubState: fn } }
          )
        ).eql(false);
      });
    });
  });

  describe("toIdSchema", () => {
    it("should return an idSchema for root field", () => {
      const schema = { type: "string" };

      expect(toIdSchema(schema)).eql({ $id: "root" });
    });

    it("should return an idSchema for nested objects", () => {
      const schema = {
        type: "object",
        properties: {
          level1: {
            type: "object",
            properties: {
              level2: { type: "string" },
            },
          },
        },
      };

      expect(toIdSchema(schema)).eql({
        $id: "root",
        level1: {
          $id: "root_level1",
          level2: { $id: "root_level1_level2" },
        },
      });
    });

    it("should return an idSchema for multiple nested objects", () => {
      const schema = {
        type: "object",
        properties: {
          level1a: {
            type: "object",
            properties: {
              level1a2a: { type: "string" },
              level1a2b: { type: "string" },
            },
          },
          level1b: {
            type: "object",
            properties: {
              level1b2a: { type: "string" },
              level1b2b: { type: "string" },
            },
          },
        },
      };

      expect(toIdSchema(schema)).eql({
        $id: "root",
        level1a: {
          $id: "root_level1a",
          level1a2a: { $id: "root_level1a_level1a2a" },
          level1a2b: { $id: "root_level1a_level1a2b" },
        },
        level1b: {
          $id: "root_level1b",
          level1b2a: { $id: "root_level1b_level1b2a" },
          level1b2b: { $id: "root_level1b_level1b2b" },
        },
      });
    });

    it("schema with an id property must not corrupt the idSchema", () => {
      const schema = {
        type: "object",
        properties: {
          metadata: {
            type: "object",
            properties: {
              id: {
                type: "string",
              },
            },
            required: ["id"],
          },
        },
      };
      expect(toIdSchema(schema)).eql({
        $id: "root",
        metadata: {
          $id: "root_metadata",
          id: { $id: "root_metadata_id" },
        },
      });
    });

    it("should return an idSchema for array item objects", () => {
      const schema = {
        type: "array",
        items: {
          type: "object",
          properties: {
            foo: { type: "string" },
          },
        },
      };

      expect(toIdSchema(schema)).eql({
        $id: "root",
        foo: { $id: "root_foo" },
      });
    });

    it("should retrieve reference schema definitions", () => {
      const schema = {
        definitions: {
          testdef: {
            type: "object",
            properties: {
              foo: { type: "string" },
              bar: { type: "string" },
            },
          },
        },
        $ref: "#/definitions/testdef",
      };

      expect(toIdSchema(schema, undefined, schema.definitions)).eql({
        $id: "root",
        foo: { $id: "root_foo" },
        bar: { $id: "root_bar" },
      });
    });
  });

  describe("parseDateString()", () => {
    it("should raise on invalid JSON datetime", () => {
      expect(() => parseDateString("plop")).to.Throw(Error, "Unable to parse");
    });

    it("should return a default object when no datetime is passed", () => {
      expect(parseDateString()).eql({
        year: -1,
        month: -1,
        day: -1,
        hour: -1,
        minute: -1,
        second: -1,
      });
    });

    it("should return a default object when time should not be included", () => {
      expect(parseDateString(undefined, false)).eql({
        year: -1,
        month: -1,
        day: -1,
        hour: 0,
        minute: 0,
        second: 0,
      });
    });

    it("should parse a valid JSON datetime string", () => {
      expect(parseDateString("2016-04-05T14:01:30.182Z")).eql({
        year: 2016,
        month: 4,
        day: 5,
        hour: 14,
        minute: 1,
        second: 30,
      });
    });

    it("should exclude time when includeTime is false", () => {
      expect(parseDateString("2016-04-05T14:01:30.182Z", false)).eql({
        year: 2016,
        month: 4,
        day: 5,
        hour: 0,
        minute: 0,
        second: 0,
      });
    });
  });

  describe("toDateString()", () => {
    it("should transform an object to a valid json datetime if time=true", () => {
      expect(
        toDateString({
          year: 2016,
          month: 4,
          day: 5,
          hour: 14,
          minute: 1,
          second: 30,
        })
      ).eql("2016-04-05T14:01:30.000Z");
    });

    it("should transform an object to a valid date string if time=false", () => {
      expect(
        toDateString(
          {
            year: 2016,
            month: 4,
            day: 5,
          },
          false
        )
      ).eql("2016-04-05");
    });
  });

  describe("pad()", () => {
    it("should pad a string with 0s", () => {
      expect(pad(4, 3)).eql("004");
    });
  });

  describe("dataURItoBlob()", () => {
    it("should return the name of the file if present", () => {
      const { blob, name } = dataURItoBlob(
        "data:image/png;name=test.png;base64,VGVzdC5wbmc="
      );
      expect(name).eql("test.png");
      expect(blob).to.have.property("size").eql(8);
      expect(blob).to.have.property("type").eql("image/png");
    });

    it("should return unknown if name is not provided", () => {
      const { blob, name } = dataURItoBlob(
        "data:image/png;base64,VGVzdC5wbmc="
      );
      expect(name).eql("unknown");
      expect(blob).to.have.property("size").eql(8);
      expect(blob).to.have.property("type").eql("image/png");
    });

    it("should return ignore unsupported parameters", () => {
      const { blob, name } = dataURItoBlob(
        "data:image/png;unknown=foobar;name=test.png;base64,VGVzdC5wbmc="
      );
      expect(name).eql("test.png");
      expect(blob).to.have.property("size").eql(8);
      expect(blob).to.have.property("type").eql("image/png");
    });
  });

  describe("deepEquals()", () => {
    // Note: deepEquals implementation being extracted from node-deeper, it's
    // worthless to reproduce all the tests existing for it; so we focus on the
    // behavioral differences we introduced.
    it("should assume functions are always equivalent", () => {
      expect(deepEquals(() => {}, () => {})).eql(true);
      expect(deepEquals({ foo() {} }, { foo() {} })).eql(true);
      expect(deepEquals({ foo: { bar() {} } }, { foo: { bar() {} } })).eql(
        true
      );
    });
  });
});
