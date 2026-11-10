"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf, __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from == "object" || typeof from == "function")
      for (let key of __getOwnPropNames(from))
        !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: !0 }) : target,
    mod
  ));

  // node_modules/qrcode/lib/can-promise.js
  var require_can_promise = __commonJS({
    "node_modules/qrcode/lib/can-promise.js"(exports, module) {
      module.exports = function() {
        return typeof Promise == "function" && Promise.prototype && Promise.prototype.then;
      };
    }
  });

  // node_modules/qrcode/lib/core/utils.js
  var require_utils = __commonJS({
    "node_modules/qrcode/lib/core/utils.js"(exports) {
      var toSJISFunction, CODEWORDS_COUNT = [
        0,
        // Not used
        26,
        44,
        70,
        100,
        134,
        172,
        196,
        242,
        292,
        346,
        404,
        466,
        532,
        581,
        655,
        733,
        815,
        901,
        991,
        1085,
        1156,
        1258,
        1364,
        1474,
        1588,
        1706,
        1828,
        1921,
        2051,
        2185,
        2323,
        2465,
        2611,
        2761,
        2876,
        3034,
        3196,
        3362,
        3532,
        3706
      ];
      exports.getSymbolSize = function(version) {
        if (!version) throw new Error('"version" cannot be null or undefined');
        if (version < 1 || version > 40) throw new Error('"version" should be in range from 1 to 40');
        return version * 4 + 17;
      };
      exports.getSymbolTotalCodewords = function(version) {
        return CODEWORDS_COUNT[version];
      };
      exports.getBCHDigit = function(data) {
        let digit = 0;
        for (; data !== 0; )
          digit++, data >>>= 1;
        return digit;
      };
      exports.setToSJISFunction = function(f) {
        if (typeof f != "function")
          throw new Error('"toSJISFunc" is not a valid function.');
        toSJISFunction = f;
      };
      exports.isKanjiModeEnabled = function() {
        return typeof toSJISFunction < "u";
      };
      exports.toSJIS = function(kanji) {
        return toSJISFunction(kanji);
      };
    }
  });

  // node_modules/qrcode/lib/core/error-correction-level.js
  var require_error_correction_level = __commonJS({
    "node_modules/qrcode/lib/core/error-correction-level.js"(exports) {
      exports.L = { bit: 1 };
      exports.M = { bit: 0 };
      exports.Q = { bit: 3 };
      exports.H = { bit: 2 };
      function fromString(string) {
        if (typeof string != "string")
          throw new Error("Param is not a string");
        switch (string.toLowerCase()) {
          case "l":
          case "low":
            return exports.L;
          case "m":
          case "medium":
            return exports.M;
          case "q":
          case "quartile":
            return exports.Q;
          case "h":
          case "high":
            return exports.H;
          default:
            throw new Error("Unknown EC Level: " + string);
        }
      }
      exports.isValid = function(level) {
        return level && typeof level.bit < "u" && level.bit >= 0 && level.bit < 4;
      };
      exports.from = function(value, defaultValue) {
        if (exports.isValid(value))
          return value;
        try {
          return fromString(value);
        } catch {
          return defaultValue;
        }
      };
    }
  });

  // node_modules/qrcode/lib/core/bit-buffer.js
  var require_bit_buffer = __commonJS({
    "node_modules/qrcode/lib/core/bit-buffer.js"(exports, module) {
      function BitBuffer() {
        this.buffer = [], this.length = 0;
      }
      BitBuffer.prototype = {
        get: function(index) {
          let bufIndex = Math.floor(index / 8);
          return (this.buffer[bufIndex] >>> 7 - index % 8 & 1) === 1;
        },
        put: function(num, length) {
          for (let i = 0; i < length; i++)
            this.putBit((num >>> length - i - 1 & 1) === 1);
        },
        getLengthInBits: function() {
          return this.length;
        },
        putBit: function(bit) {
          let bufIndex = Math.floor(this.length / 8);
          this.buffer.length <= bufIndex && this.buffer.push(0), bit && (this.buffer[bufIndex] |= 128 >>> this.length % 8), this.length++;
        }
      };
      module.exports = BitBuffer;
    }
  });

  // node_modules/qrcode/lib/core/bit-matrix.js
  var require_bit_matrix = __commonJS({
    "node_modules/qrcode/lib/core/bit-matrix.js"(exports, module) {
      function BitMatrix(size) {
        if (!size || size < 1)
          throw new Error("BitMatrix size must be defined and greater than 0");
        this.size = size, this.data = new Uint8Array(size * size), this.reservedBit = new Uint8Array(size * size);
      }
      BitMatrix.prototype.set = function(row, col, value, reserved) {
        let index = row * this.size + col;
        this.data[index] = value, reserved && (this.reservedBit[index] = !0);
      };
      BitMatrix.prototype.get = function(row, col) {
        return this.data[row * this.size + col];
      };
      BitMatrix.prototype.xor = function(row, col, value) {
        this.data[row * this.size + col] ^= value;
      };
      BitMatrix.prototype.isReserved = function(row, col) {
        return this.reservedBit[row * this.size + col];
      };
      module.exports = BitMatrix;
    }
  });

  // node_modules/qrcode/lib/core/alignment-pattern.js
  var require_alignment_pattern = __commonJS({
    "node_modules/qrcode/lib/core/alignment-pattern.js"(exports) {
      var getSymbolSize = require_utils().getSymbolSize;
      exports.getRowColCoords = function(version) {
        if (version === 1) return [];
        let posCount = Math.floor(version / 7) + 2, size = getSymbolSize(version), intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2, positions = [size - 7];
        for (let i = 1; i < posCount - 1; i++)
          positions[i] = positions[i - 1] - intervals;
        return positions.push(6), positions.reverse();
      };
      exports.getPositions = function(version) {
        let coords = [], pos = exports.getRowColCoords(version), posLength = pos.length;
        for (let i = 0; i < posLength; i++)
          for (let j = 0; j < posLength; j++)
            i === 0 && j === 0 || // top-left
            i === 0 && j === posLength - 1 || // bottom-left
            i === posLength - 1 && j === 0 || coords.push([pos[i], pos[j]]);
        return coords;
      };
    }
  });

  // node_modules/qrcode/lib/core/finder-pattern.js
  var require_finder_pattern = __commonJS({
    "node_modules/qrcode/lib/core/finder-pattern.js"(exports) {
      var getSymbolSize = require_utils().getSymbolSize, FINDER_PATTERN_SIZE = 7;
      exports.getPositions = function(version) {
        let size = getSymbolSize(version);
        return [
          // top-left
          [0, 0],
          // top-right
          [size - FINDER_PATTERN_SIZE, 0],
          // bottom-left
          [0, size - FINDER_PATTERN_SIZE]
        ];
      };
    }
  });

  // node_modules/qrcode/lib/core/mask-pattern.js
  var require_mask_pattern = __commonJS({
    "node_modules/qrcode/lib/core/mask-pattern.js"(exports) {
      exports.Patterns = {
        PATTERN000: 0,
        PATTERN001: 1,
        PATTERN010: 2,
        PATTERN011: 3,
        PATTERN100: 4,
        PATTERN101: 5,
        PATTERN110: 6,
        PATTERN111: 7
      };
      var PenaltyScores = {
        N1: 3,
        N2: 3,
        N3: 40,
        N4: 10
      };
      exports.isValid = function(mask) {
        return mask != null && mask !== "" && !isNaN(mask) && mask >= 0 && mask <= 7;
      };
      exports.from = function(value) {
        return exports.isValid(value) ? parseInt(value, 10) : void 0;
      };
      exports.getPenaltyN1 = function(data) {
        let size = data.size, points = 0, sameCountCol = 0, sameCountRow = 0, lastCol = null, lastRow = null;
        for (let row = 0; row < size; row++) {
          sameCountCol = sameCountRow = 0, lastCol = lastRow = null;
          for (let col = 0; col < size; col++) {
            let module2 = data.get(row, col);
            module2 === lastCol ? sameCountCol++ : (sameCountCol >= 5 && (points += PenaltyScores.N1 + (sameCountCol - 5)), lastCol = module2, sameCountCol = 1), module2 = data.get(col, row), module2 === lastRow ? sameCountRow++ : (sameCountRow >= 5 && (points += PenaltyScores.N1 + (sameCountRow - 5)), lastRow = module2, sameCountRow = 1);
          }
          sameCountCol >= 5 && (points += PenaltyScores.N1 + (sameCountCol - 5)), sameCountRow >= 5 && (points += PenaltyScores.N1 + (sameCountRow - 5));
        }
        return points;
      };
      exports.getPenaltyN2 = function(data) {
        let size = data.size, points = 0;
        for (let row = 0; row < size - 1; row++)
          for (let col = 0; col < size - 1; col++) {
            let last = data.get(row, col) + data.get(row, col + 1) + data.get(row + 1, col) + data.get(row + 1, col + 1);
            (last === 4 || last === 0) && points++;
          }
        return points * PenaltyScores.N2;
      };
      exports.getPenaltyN3 = function(data) {
        let size = data.size, points = 0, bitsCol = 0, bitsRow = 0;
        for (let row = 0; row < size; row++) {
          bitsCol = bitsRow = 0;
          for (let col = 0; col < size; col++)
            bitsCol = bitsCol << 1 & 2047 | data.get(row, col), col >= 10 && (bitsCol === 1488 || bitsCol === 93) && points++, bitsRow = bitsRow << 1 & 2047 | data.get(col, row), col >= 10 && (bitsRow === 1488 || bitsRow === 93) && points++;
        }
        return points * PenaltyScores.N3;
      };
      exports.getPenaltyN4 = function(data) {
        let darkCount = 0, modulesCount = data.data.length;
        for (let i = 0; i < modulesCount; i++) darkCount += data.data[i];
        return Math.abs(Math.ceil(darkCount * 100 / modulesCount / 5) - 10) * PenaltyScores.N4;
      };
      function getMaskAt(maskPattern, i, j) {
        switch (maskPattern) {
          case exports.Patterns.PATTERN000:
            return (i + j) % 2 === 0;
          case exports.Patterns.PATTERN001:
            return i % 2 === 0;
          case exports.Patterns.PATTERN010:
            return j % 3 === 0;
          case exports.Patterns.PATTERN011:
            return (i + j) % 3 === 0;
          case exports.Patterns.PATTERN100:
            return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
          case exports.Patterns.PATTERN101:
            return i * j % 2 + i * j % 3 === 0;
          case exports.Patterns.PATTERN110:
            return (i * j % 2 + i * j % 3) % 2 === 0;
          case exports.Patterns.PATTERN111:
            return (i * j % 3 + (i + j) % 2) % 2 === 0;
          default:
            throw new Error("bad maskPattern:" + maskPattern);
        }
      }
      exports.applyMask = function(pattern, data) {
        let size = data.size;
        for (let col = 0; col < size; col++)
          for (let row = 0; row < size; row++)
            data.isReserved(row, col) || data.xor(row, col, getMaskAt(pattern, row, col));
      };
      exports.getBestMask = function(data, setupFormatFunc) {
        let numPatterns = Object.keys(exports.Patterns).length, bestPattern = 0, lowerPenalty = 1 / 0;
        for (let p = 0; p < numPatterns; p++) {
          setupFormatFunc(p), exports.applyMask(p, data);
          let penalty = exports.getPenaltyN1(data) + exports.getPenaltyN2(data) + exports.getPenaltyN3(data) + exports.getPenaltyN4(data);
          exports.applyMask(p, data), penalty < lowerPenalty && (lowerPenalty = penalty, bestPattern = p);
        }
        return bestPattern;
      };
    }
  });

  // node_modules/qrcode/lib/core/error-correction-code.js
  var require_error_correction_code = __commonJS({
    "node_modules/qrcode/lib/core/error-correction-code.js"(exports) {
      var ECLevel = require_error_correction_level(), EC_BLOCKS_TABLE = [
        // L  M  Q  H
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        2,
        2,
        1,
        2,
        2,
        4,
        1,
        2,
        4,
        4,
        2,
        4,
        4,
        4,
        2,
        4,
        6,
        5,
        2,
        4,
        6,
        6,
        2,
        5,
        8,
        8,
        4,
        5,
        8,
        8,
        4,
        5,
        8,
        11,
        4,
        8,
        10,
        11,
        4,
        9,
        12,
        16,
        4,
        9,
        16,
        16,
        6,
        10,
        12,
        18,
        6,
        10,
        17,
        16,
        6,
        11,
        16,
        19,
        6,
        13,
        18,
        21,
        7,
        14,
        21,
        25,
        8,
        16,
        20,
        25,
        8,
        17,
        23,
        25,
        9,
        17,
        23,
        34,
        9,
        18,
        25,
        30,
        10,
        20,
        27,
        32,
        12,
        21,
        29,
        35,
        12,
        23,
        34,
        37,
        12,
        25,
        34,
        40,
        13,
        26,
        35,
        42,
        14,
        28,
        38,
        45,
        15,
        29,
        40,
        48,
        16,
        31,
        43,
        51,
        17,
        33,
        45,
        54,
        18,
        35,
        48,
        57,
        19,
        37,
        51,
        60,
        19,
        38,
        53,
        63,
        20,
        40,
        56,
        66,
        21,
        43,
        59,
        70,
        22,
        45,
        62,
        74,
        24,
        47,
        65,
        77,
        25,
        49,
        68,
        81
      ], EC_CODEWORDS_TABLE = [
        // L  M  Q  H
        7,
        10,
        13,
        17,
        10,
        16,
        22,
        28,
        15,
        26,
        36,
        44,
        20,
        36,
        52,
        64,
        26,
        48,
        72,
        88,
        36,
        64,
        96,
        112,
        40,
        72,
        108,
        130,
        48,
        88,
        132,
        156,
        60,
        110,
        160,
        192,
        72,
        130,
        192,
        224,
        80,
        150,
        224,
        264,
        96,
        176,
        260,
        308,
        104,
        198,
        288,
        352,
        120,
        216,
        320,
        384,
        132,
        240,
        360,
        432,
        144,
        280,
        408,
        480,
        168,
        308,
        448,
        532,
        180,
        338,
        504,
        588,
        196,
        364,
        546,
        650,
        224,
        416,
        600,
        700,
        224,
        442,
        644,
        750,
        252,
        476,
        690,
        816,
        270,
        504,
        750,
        900,
        300,
        560,
        810,
        960,
        312,
        588,
        870,
        1050,
        336,
        644,
        952,
        1110,
        360,
        700,
        1020,
        1200,
        390,
        728,
        1050,
        1260,
        420,
        784,
        1140,
        1350,
        450,
        812,
        1200,
        1440,
        480,
        868,
        1290,
        1530,
        510,
        924,
        1350,
        1620,
        540,
        980,
        1440,
        1710,
        570,
        1036,
        1530,
        1800,
        570,
        1064,
        1590,
        1890,
        600,
        1120,
        1680,
        1980,
        630,
        1204,
        1770,
        2100,
        660,
        1260,
        1860,
        2220,
        720,
        1316,
        1950,
        2310,
        750,
        1372,
        2040,
        2430
      ];
      exports.getBlocksCount = function(version, errorCorrectionLevel) {
        switch (errorCorrectionLevel) {
          case ECLevel.L:
            return EC_BLOCKS_TABLE[(version - 1) * 4 + 0];
          case ECLevel.M:
            return EC_BLOCKS_TABLE[(version - 1) * 4 + 1];
          case ECLevel.Q:
            return EC_BLOCKS_TABLE[(version - 1) * 4 + 2];
          case ECLevel.H:
            return EC_BLOCKS_TABLE[(version - 1) * 4 + 3];
          default:
            return;
        }
      };
      exports.getTotalCodewordsCount = function(version, errorCorrectionLevel) {
        switch (errorCorrectionLevel) {
          case ECLevel.L:
            return EC_CODEWORDS_TABLE[(version - 1) * 4 + 0];
          case ECLevel.M:
            return EC_CODEWORDS_TABLE[(version - 1) * 4 + 1];
          case ECLevel.Q:
            return EC_CODEWORDS_TABLE[(version - 1) * 4 + 2];
          case ECLevel.H:
            return EC_CODEWORDS_TABLE[(version - 1) * 4 + 3];
          default:
            return;
        }
      };
    }
  });

  // node_modules/qrcode/lib/core/galois-field.js
  var require_galois_field = __commonJS({
    "node_modules/qrcode/lib/core/galois-field.js"(exports) {
      var EXP_TABLE = new Uint8Array(512), LOG_TABLE = new Uint8Array(256);
      (function() {
        let x = 1;
        for (let i = 0; i < 255; i++)
          EXP_TABLE[i] = x, LOG_TABLE[x] = i, x <<= 1, x & 256 && (x ^= 285);
        for (let i = 255; i < 512; i++)
          EXP_TABLE[i] = EXP_TABLE[i - 255];
      })();
      exports.log = function(n) {
        if (n < 1) throw new Error("log(" + n + ")");
        return LOG_TABLE[n];
      };
      exports.exp = function(n) {
        return EXP_TABLE[n];
      };
      exports.mul = function(x, y) {
        return x === 0 || y === 0 ? 0 : EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
      };
    }
  });

  // node_modules/qrcode/lib/core/polynomial.js
  var require_polynomial = __commonJS({
    "node_modules/qrcode/lib/core/polynomial.js"(exports) {
      var GF = require_galois_field();
      exports.mul = function(p1, p2) {
        let coeff = new Uint8Array(p1.length + p2.length - 1);
        for (let i = 0; i < p1.length; i++)
          for (let j = 0; j < p2.length; j++)
            coeff[i + j] ^= GF.mul(p1[i], p2[j]);
        return coeff;
      };
      exports.mod = function(divident, divisor) {
        let result = new Uint8Array(divident);
        for (; result.length - divisor.length >= 0; ) {
          let coeff = result[0];
          for (let i = 0; i < divisor.length; i++)
            result[i] ^= GF.mul(divisor[i], coeff);
          let offset = 0;
          for (; offset < result.length && result[offset] === 0; ) offset++;
          result = result.slice(offset);
        }
        return result;
      };
      exports.generateECPolynomial = function(degree) {
        let poly = new Uint8Array([1]);
        for (let i = 0; i < degree; i++)
          poly = exports.mul(poly, new Uint8Array([1, GF.exp(i)]));
        return poly;
      };
    }
  });

  // node_modules/qrcode/lib/core/reed-solomon-encoder.js
  var require_reed_solomon_encoder = __commonJS({
    "node_modules/qrcode/lib/core/reed-solomon-encoder.js"(exports, module) {
      var Polynomial = require_polynomial();
      function ReedSolomonEncoder(degree) {
        this.genPoly = void 0, this.degree = degree, this.degree && this.initialize(this.degree);
      }
      ReedSolomonEncoder.prototype.initialize = function(degree) {
        this.degree = degree, this.genPoly = Polynomial.generateECPolynomial(this.degree);
      };
      ReedSolomonEncoder.prototype.encode = function(data) {
        if (!this.genPoly)
          throw new Error("Encoder not initialized");
        let paddedData = new Uint8Array(data.length + this.degree);
        paddedData.set(data);
        let remainder = Polynomial.mod(paddedData, this.genPoly), start = this.degree - remainder.length;
        if (start > 0) {
          let buff = new Uint8Array(this.degree);
          return buff.set(remainder, start), buff;
        }
        return remainder;
      };
      module.exports = ReedSolomonEncoder;
    }
  });

  // node_modules/qrcode/lib/core/version-check.js
  var require_version_check = __commonJS({
    "node_modules/qrcode/lib/core/version-check.js"(exports) {
      exports.isValid = function(version) {
        return !isNaN(version) && version >= 1 && version <= 40;
      };
    }
  });

  // node_modules/qrcode/lib/core/regex.js
  var require_regex = __commonJS({
    "node_modules/qrcode/lib/core/regex.js"(exports) {
      var numeric = "[0-9]+", alphanumeric = "[A-Z $%*+\\-./:]+", kanji = "(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";
      kanji = kanji.replace(/u/g, "\\u");
      var byte = "(?:(?![A-Z0-9 $%*+\\-./:]|" + kanji + `)(?:.|[\r
]))+`;
      exports.KANJI = new RegExp(kanji, "g");
      exports.BYTE_KANJI = new RegExp("[^A-Z0-9 $%*+\\-./:]+", "g");
      exports.BYTE = new RegExp(byte, "g");
      exports.NUMERIC = new RegExp(numeric, "g");
      exports.ALPHANUMERIC = new RegExp(alphanumeric, "g");
      var TEST_KANJI = new RegExp("^" + kanji + "$"), TEST_NUMERIC = new RegExp("^" + numeric + "$"), TEST_ALPHANUMERIC = new RegExp("^[A-Z0-9 $%*+\\-./:]+$");
      exports.testKanji = function(str) {
        return TEST_KANJI.test(str);
      };
      exports.testNumeric = function(str) {
        return TEST_NUMERIC.test(str);
      };
      exports.testAlphanumeric = function(str) {
        return TEST_ALPHANUMERIC.test(str);
      };
    }
  });

  // node_modules/qrcode/lib/core/mode.js
  var require_mode = __commonJS({
    "node_modules/qrcode/lib/core/mode.js"(exports) {
      var VersionCheck = require_version_check(), Regex = require_regex();
      exports.NUMERIC = {
        id: "Numeric",
        bit: 1,
        ccBits: [10, 12, 14]
      };
      exports.ALPHANUMERIC = {
        id: "Alphanumeric",
        bit: 2,
        ccBits: [9, 11, 13]
      };
      exports.BYTE = {
        id: "Byte",
        bit: 4,
        ccBits: [8, 16, 16]
      };
      exports.KANJI = {
        id: "Kanji",
        bit: 8,
        ccBits: [8, 10, 12]
      };
      exports.MIXED = {
        bit: -1
      };
      exports.getCharCountIndicator = function(mode, version) {
        if (!mode.ccBits) throw new Error("Invalid mode: " + mode);
        if (!VersionCheck.isValid(version))
          throw new Error("Invalid version: " + version);
        return version >= 1 && version < 10 ? mode.ccBits[0] : version < 27 ? mode.ccBits[1] : mode.ccBits[2];
      };
      exports.getBestModeForData = function(dataStr) {
        return Regex.testNumeric(dataStr) ? exports.NUMERIC : Regex.testAlphanumeric(dataStr) ? exports.ALPHANUMERIC : Regex.testKanji(dataStr) ? exports.KANJI : exports.BYTE;
      };
      exports.toString = function(mode) {
        if (mode && mode.id) return mode.id;
        throw new Error("Invalid mode");
      };
      exports.isValid = function(mode) {
        return mode && mode.bit && mode.ccBits;
      };
      function fromString(string) {
        if (typeof string != "string")
          throw new Error("Param is not a string");
        switch (string.toLowerCase()) {
          case "numeric":
            return exports.NUMERIC;
          case "alphanumeric":
            return exports.ALPHANUMERIC;
          case "kanji":
            return exports.KANJI;
          case "byte":
            return exports.BYTE;
          default:
            throw new Error("Unknown mode: " + string);
        }
      }
      exports.from = function(value, defaultValue) {
        if (exports.isValid(value))
          return value;
        try {
          return fromString(value);
        } catch {
          return defaultValue;
        }
      };
    }
  });

  // node_modules/qrcode/lib/core/version.js
  var require_version = __commonJS({
    "node_modules/qrcode/lib/core/version.js"(exports) {
      var Utils = require_utils(), ECCode = require_error_correction_code(), ECLevel = require_error_correction_level(), Mode = require_mode(), VersionCheck = require_version_check(), G18 = 7973, G18_BCH = Utils.getBCHDigit(G18);
      function getBestVersionForDataLength(mode, length, errorCorrectionLevel) {
        for (let currentVersion = 1; currentVersion <= 40; currentVersion++)
          if (length <= exports.getCapacity(currentVersion, errorCorrectionLevel, mode))
            return currentVersion;
      }
      function getReservedBitsCount(mode, version) {
        return Mode.getCharCountIndicator(mode, version) + 4;
      }
      function getTotalBitsFromDataArray(segments, version) {
        let totalBits = 0;
        return segments.forEach(function(data) {
          let reservedBits = getReservedBitsCount(data.mode, version);
          totalBits += reservedBits + data.getBitsLength();
        }), totalBits;
      }
      function getBestVersionForMixedData(segments, errorCorrectionLevel) {
        for (let currentVersion = 1; currentVersion <= 40; currentVersion++)
          if (getTotalBitsFromDataArray(segments, currentVersion) <= exports.getCapacity(currentVersion, errorCorrectionLevel, Mode.MIXED))
            return currentVersion;
      }
      exports.from = function(value, defaultValue) {
        return VersionCheck.isValid(value) ? parseInt(value, 10) : defaultValue;
      };
      exports.getCapacity = function(version, errorCorrectionLevel, mode) {
        if (!VersionCheck.isValid(version))
          throw new Error("Invalid QR Code version");
        typeof mode > "u" && (mode = Mode.BYTE);
        let totalCodewords = Utils.getSymbolTotalCodewords(version), ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel), dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
        if (mode === Mode.MIXED) return dataTotalCodewordsBits;
        let usableBits = dataTotalCodewordsBits - getReservedBitsCount(mode, version);
        switch (mode) {
          case Mode.NUMERIC:
            return Math.floor(usableBits / 10 * 3);
          case Mode.ALPHANUMERIC:
            return Math.floor(usableBits / 11 * 2);
          case Mode.KANJI:
            return Math.floor(usableBits / 13);
          case Mode.BYTE:
          default:
            return Math.floor(usableBits / 8);
        }
      };
      exports.getBestVersionForData = function(data, errorCorrectionLevel) {
        let seg, ecl = ECLevel.from(errorCorrectionLevel, ECLevel.M);
        if (Array.isArray(data)) {
          if (data.length > 1)
            return getBestVersionForMixedData(data, ecl);
          if (data.length === 0)
            return 1;
          seg = data[0];
        } else
          seg = data;
        return getBestVersionForDataLength(seg.mode, seg.getLength(), ecl);
      };
      exports.getEncodedBits = function(version) {
        if (!VersionCheck.isValid(version) || version < 7)
          throw new Error("Invalid QR Code version");
        let d = version << 12;
        for (; Utils.getBCHDigit(d) - G18_BCH >= 0; )
          d ^= G18 << Utils.getBCHDigit(d) - G18_BCH;
        return version << 12 | d;
      };
    }
  });

  // node_modules/qrcode/lib/core/format-info.js
  var require_format_info = __commonJS({
    "node_modules/qrcode/lib/core/format-info.js"(exports) {
      var Utils = require_utils(), G15 = 1335, G15_MASK = 21522, G15_BCH = Utils.getBCHDigit(G15);
      exports.getEncodedBits = function(errorCorrectionLevel, mask) {
        let data = errorCorrectionLevel.bit << 3 | mask, d = data << 10;
        for (; Utils.getBCHDigit(d) - G15_BCH >= 0; )
          d ^= G15 << Utils.getBCHDigit(d) - G15_BCH;
        return (data << 10 | d) ^ G15_MASK;
      };
    }
  });

  // node_modules/qrcode/lib/core/numeric-data.js
  var require_numeric_data = __commonJS({
    "node_modules/qrcode/lib/core/numeric-data.js"(exports, module) {
      var Mode = require_mode();
      function NumericData(data) {
        this.mode = Mode.NUMERIC, this.data = data.toString();
      }
      NumericData.getBitsLength = function(length) {
        return 10 * Math.floor(length / 3) + (length % 3 ? length % 3 * 3 + 1 : 0);
      };
      NumericData.prototype.getLength = function() {
        return this.data.length;
      };
      NumericData.prototype.getBitsLength = function() {
        return NumericData.getBitsLength(this.data.length);
      };
      NumericData.prototype.write = function(bitBuffer) {
        let i, group, value;
        for (i = 0; i + 3 <= this.data.length; i += 3)
          group = this.data.substr(i, 3), value = parseInt(group, 10), bitBuffer.put(value, 10);
        let remainingNum = this.data.length - i;
        remainingNum > 0 && (group = this.data.substr(i), value = parseInt(group, 10), bitBuffer.put(value, remainingNum * 3 + 1));
      };
      module.exports = NumericData;
    }
  });

  // node_modules/qrcode/lib/core/alphanumeric-data.js
  var require_alphanumeric_data = __commonJS({
    "node_modules/qrcode/lib/core/alphanumeric-data.js"(exports, module) {
      var Mode = require_mode(), ALPHA_NUM_CHARS = [
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
        "G",
        "H",
        "I",
        "J",
        "K",
        "L",
        "M",
        "N",
        "O",
        "P",
        "Q",
        "R",
        "S",
        "T",
        "U",
        "V",
        "W",
        "X",
        "Y",
        "Z",
        " ",
        "$",
        "%",
        "*",
        "+",
        "-",
        ".",
        "/",
        ":"
      ];
      function AlphanumericData(data) {
        this.mode = Mode.ALPHANUMERIC, this.data = data;
      }
      AlphanumericData.getBitsLength = function(length) {
        return 11 * Math.floor(length / 2) + 6 * (length % 2);
      };
      AlphanumericData.prototype.getLength = function() {
        return this.data.length;
      };
      AlphanumericData.prototype.getBitsLength = function() {
        return AlphanumericData.getBitsLength(this.data.length);
      };
      AlphanumericData.prototype.write = function(bitBuffer) {
        let i;
        for (i = 0; i + 2 <= this.data.length; i += 2) {
          let value = ALPHA_NUM_CHARS.indexOf(this.data[i]) * 45;
          value += ALPHA_NUM_CHARS.indexOf(this.data[i + 1]), bitBuffer.put(value, 11);
        }
        this.data.length % 2 && bitBuffer.put(ALPHA_NUM_CHARS.indexOf(this.data[i]), 6);
      };
      module.exports = AlphanumericData;
    }
  });

  // node_modules/qrcode/lib/core/byte-data.js
  var require_byte_data = __commonJS({
    "node_modules/qrcode/lib/core/byte-data.js"(exports, module) {
      var Mode = require_mode();
      function ByteData(data) {
        this.mode = Mode.BYTE, typeof data == "string" ? this.data = new TextEncoder().encode(data) : this.data = new Uint8Array(data);
      }
      ByteData.getBitsLength = function(length) {
        return length * 8;
      };
      ByteData.prototype.getLength = function() {
        return this.data.length;
      };
      ByteData.prototype.getBitsLength = function() {
        return ByteData.getBitsLength(this.data.length);
      };
      ByteData.prototype.write = function(bitBuffer) {
        for (let i = 0, l = this.data.length; i < l; i++)
          bitBuffer.put(this.data[i], 8);
      };
      module.exports = ByteData;
    }
  });

  // node_modules/qrcode/lib/core/kanji-data.js
  var require_kanji_data = __commonJS({
    "node_modules/qrcode/lib/core/kanji-data.js"(exports, module) {
      var Mode = require_mode(), Utils = require_utils();
      function KanjiData(data) {
        this.mode = Mode.KANJI, this.data = data;
      }
      KanjiData.getBitsLength = function(length) {
        return length * 13;
      };
      KanjiData.prototype.getLength = function() {
        return this.data.length;
      };
      KanjiData.prototype.getBitsLength = function() {
        return KanjiData.getBitsLength(this.data.length);
      };
      KanjiData.prototype.write = function(bitBuffer) {
        let i;
        for (i = 0; i < this.data.length; i++) {
          let value = Utils.toSJIS(this.data[i]);
          if (value >= 33088 && value <= 40956)
            value -= 33088;
          else if (value >= 57408 && value <= 60351)
            value -= 49472;
          else
            throw new Error(
              "Invalid SJIS character: " + this.data[i] + `
Make sure your charset is UTF-8`
            );
          value = (value >>> 8 & 255) * 192 + (value & 255), bitBuffer.put(value, 13);
        }
      };
      module.exports = KanjiData;
    }
  });

  // node_modules/dijkstrajs/dijkstra.js
  var require_dijkstra = __commonJS({
    "node_modules/dijkstrajs/dijkstra.js"(exports, module) {
      "use strict";
      var dijkstra = {
        single_source_shortest_paths: function(graph, s, d) {
          var predecessors = {}, costs = {};
          costs[s] = 0;
          var open = dijkstra.PriorityQueue.make();
          open.push(s, 0);
          for (var closest, u, v, cost_of_s_to_u, adjacent_nodes, cost_of_e, cost_of_s_to_u_plus_cost_of_e, cost_of_s_to_v, first_visit; !open.empty(); ) {
            closest = open.pop(), u = closest.value, cost_of_s_to_u = closest.cost, adjacent_nodes = graph[u] || {};
            for (v in adjacent_nodes)
              adjacent_nodes.hasOwnProperty(v) && (cost_of_e = adjacent_nodes[v], cost_of_s_to_u_plus_cost_of_e = cost_of_s_to_u + cost_of_e, cost_of_s_to_v = costs[v], first_visit = typeof costs[v] > "u", (first_visit || cost_of_s_to_v > cost_of_s_to_u_plus_cost_of_e) && (costs[v] = cost_of_s_to_u_plus_cost_of_e, open.push(v, cost_of_s_to_u_plus_cost_of_e), predecessors[v] = u));
          }
          if (typeof d < "u" && typeof costs[d] > "u") {
            var msg = ["Could not find a path from ", s, " to ", d, "."].join("");
            throw new Error(msg);
          }
          return predecessors;
        },
        extract_shortest_path_from_predecessor_list: function(predecessors, d) {
          for (var nodes = [], u = d, predecessor; u; )
            nodes.push(u), predecessor = predecessors[u], u = predecessors[u];
          return nodes.reverse(), nodes;
        },
        find_path: function(graph, s, d) {
          var predecessors = dijkstra.single_source_shortest_paths(graph, s, d);
          return dijkstra.extract_shortest_path_from_predecessor_list(
            predecessors,
            d
          );
        },
        /**
         * A very naive priority queue implementation.
         */
        PriorityQueue: {
          make: function(opts) {
            var T = dijkstra.PriorityQueue, t = {}, key;
            opts = opts || {};
            for (key in T)
              T.hasOwnProperty(key) && (t[key] = T[key]);
            return t.queue = [], t.sorter = opts.sorter || T.default_sorter, t;
          },
          default_sorter: function(a, b) {
            return a.cost - b.cost;
          },
          /**
           * Add a new item to the queue and ensure the highest priority element
           * is at the front of the queue.
           */
          push: function(value, cost) {
            var item = { value, cost };
            this.queue.push(item), this.queue.sort(this.sorter);
          },
          /**
           * Return the highest priority element in the queue.
           */
          pop: function() {
            return this.queue.shift();
          },
          empty: function() {
            return this.queue.length === 0;
          }
        }
      };
      typeof module < "u" && (module.exports = dijkstra);
    }
  });

  // node_modules/qrcode/lib/core/segments.js
  var require_segments = __commonJS({
    "node_modules/qrcode/lib/core/segments.js"(exports) {
      var Mode = require_mode(), NumericData = require_numeric_data(), AlphanumericData = require_alphanumeric_data(), ByteData = require_byte_data(), KanjiData = require_kanji_data(), Regex = require_regex(), Utils = require_utils(), dijkstra = require_dijkstra();
      function getStringByteLength(str) {
        return unescape(encodeURIComponent(str)).length;
      }
      function getSegments(regex, mode, str) {
        let segments = [], result;
        for (; (result = regex.exec(str)) !== null; )
          segments.push({
            data: result[0],
            index: result.index,
            mode,
            length: result[0].length
          });
        return segments;
      }
      function getSegmentsFromString(dataStr) {
        let numSegs = getSegments(Regex.NUMERIC, Mode.NUMERIC, dataStr), alphaNumSegs = getSegments(Regex.ALPHANUMERIC, Mode.ALPHANUMERIC, dataStr), byteSegs, kanjiSegs;
        return Utils.isKanjiModeEnabled() ? (byteSegs = getSegments(Regex.BYTE, Mode.BYTE, dataStr), kanjiSegs = getSegments(Regex.KANJI, Mode.KANJI, dataStr)) : (byteSegs = getSegments(Regex.BYTE_KANJI, Mode.BYTE, dataStr), kanjiSegs = []), numSegs.concat(alphaNumSegs, byteSegs, kanjiSegs).sort(function(s1, s2) {
          return s1.index - s2.index;
        }).map(function(obj) {
          return {
            data: obj.data,
            mode: obj.mode,
            length: obj.length
          };
        });
      }
      function getSegmentBitsLength(length, mode) {
        switch (mode) {
          case Mode.NUMERIC:
            return NumericData.getBitsLength(length);
          case Mode.ALPHANUMERIC:
            return AlphanumericData.getBitsLength(length);
          case Mode.KANJI:
            return KanjiData.getBitsLength(length);
          case Mode.BYTE:
            return ByteData.getBitsLength(length);
        }
      }
      function mergeSegments(segs) {
        return segs.reduce(function(acc, curr) {
          let prevSeg = acc.length - 1 >= 0 ? acc[acc.length - 1] : null;
          return prevSeg && prevSeg.mode === curr.mode ? (acc[acc.length - 1].data += curr.data, acc) : (acc.push(curr), acc);
        }, []);
      }
      function buildNodes(segs) {
        let nodes = [];
        for (let i = 0; i < segs.length; i++) {
          let seg = segs[i];
          switch (seg.mode) {
            case Mode.NUMERIC:
              nodes.push([
                seg,
                { data: seg.data, mode: Mode.ALPHANUMERIC, length: seg.length },
                { data: seg.data, mode: Mode.BYTE, length: seg.length }
              ]);
              break;
            case Mode.ALPHANUMERIC:
              nodes.push([
                seg,
                { data: seg.data, mode: Mode.BYTE, length: seg.length }
              ]);
              break;
            case Mode.KANJI:
              nodes.push([
                seg,
                { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
              ]);
              break;
            case Mode.BYTE:
              nodes.push([
                { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
              ]);
          }
        }
        return nodes;
      }
      function buildGraph(nodes, version) {
        let table = {}, graph = { start: {} }, prevNodeIds = ["start"];
        for (let i = 0; i < nodes.length; i++) {
          let nodeGroup = nodes[i], currentNodeIds = [];
          for (let j = 0; j < nodeGroup.length; j++) {
            let node = nodeGroup[j], key = "" + i + j;
            currentNodeIds.push(key), table[key] = { node, lastCount: 0 }, graph[key] = {};
            for (let n = 0; n < prevNodeIds.length; n++) {
              let prevNodeId = prevNodeIds[n];
              table[prevNodeId] && table[prevNodeId].node.mode === node.mode ? (graph[prevNodeId][key] = getSegmentBitsLength(table[prevNodeId].lastCount + node.length, node.mode) - getSegmentBitsLength(table[prevNodeId].lastCount, node.mode), table[prevNodeId].lastCount += node.length) : (table[prevNodeId] && (table[prevNodeId].lastCount = node.length), graph[prevNodeId][key] = getSegmentBitsLength(node.length, node.mode) + 4 + Mode.getCharCountIndicator(node.mode, version));
            }
          }
          prevNodeIds = currentNodeIds;
        }
        for (let n = 0; n < prevNodeIds.length; n++)
          graph[prevNodeIds[n]].end = 0;
        return { map: graph, table };
      }
      function buildSingleSegment(data, modesHint) {
        let mode, bestMode = Mode.getBestModeForData(data);
        if (mode = Mode.from(modesHint, bestMode), mode !== Mode.BYTE && mode.bit < bestMode.bit)
          throw new Error('"' + data + '" cannot be encoded with mode ' + Mode.toString(mode) + `.
 Suggested mode is: ` + Mode.toString(bestMode));
        switch (mode === Mode.KANJI && !Utils.isKanjiModeEnabled() && (mode = Mode.BYTE), mode) {
          case Mode.NUMERIC:
            return new NumericData(data);
          case Mode.ALPHANUMERIC:
            return new AlphanumericData(data);
          case Mode.KANJI:
            return new KanjiData(data);
          case Mode.BYTE:
            return new ByteData(data);
        }
      }
      exports.fromArray = function(array) {
        return array.reduce(function(acc, seg) {
          return typeof seg == "string" ? acc.push(buildSingleSegment(seg, null)) : seg.data && acc.push(buildSingleSegment(seg.data, seg.mode)), acc;
        }, []);
      };
      exports.fromString = function(data, version) {
        let segs = getSegmentsFromString(data, Utils.isKanjiModeEnabled()), nodes = buildNodes(segs), graph = buildGraph(nodes, version), path = dijkstra.find_path(graph.map, "start", "end"), optimizedSegs = [];
        for (let i = 1; i < path.length - 1; i++)
          optimizedSegs.push(graph.table[path[i]].node);
        return exports.fromArray(mergeSegments(optimizedSegs));
      };
      exports.rawSplit = function(data) {
        return exports.fromArray(
          getSegmentsFromString(data, Utils.isKanjiModeEnabled())
        );
      };
    }
  });

  // node_modules/qrcode/lib/core/qrcode.js
  var require_qrcode = __commonJS({
    "node_modules/qrcode/lib/core/qrcode.js"(exports) {
      var Utils = require_utils(), ECLevel = require_error_correction_level(), BitBuffer = require_bit_buffer(), BitMatrix = require_bit_matrix(), AlignmentPattern = require_alignment_pattern(), FinderPattern = require_finder_pattern(), MaskPattern = require_mask_pattern(), ECCode = require_error_correction_code(), ReedSolomonEncoder = require_reed_solomon_encoder(), Version = require_version(), FormatInfo = require_format_info(), Mode = require_mode(), Segments = require_segments();
      function setupFinderPattern(matrix, version) {
        let size = matrix.size, pos = FinderPattern.getPositions(version);
        for (let i = 0; i < pos.length; i++) {
          let row = pos[i][0], col = pos[i][1];
          for (let r = -1; r <= 7; r++)
            if (!(row + r <= -1 || size <= row + r))
              for (let c = -1; c <= 7; c++)
                col + c <= -1 || size <= col + c || (r >= 0 && r <= 6 && (c === 0 || c === 6) || c >= 0 && c <= 6 && (r === 0 || r === 6) || r >= 2 && r <= 4 && c >= 2 && c <= 4 ? matrix.set(row + r, col + c, !0, !0) : matrix.set(row + r, col + c, !1, !0));
        }
      }
      function setupTimingPattern(matrix) {
        let size = matrix.size;
        for (let r = 8; r < size - 8; r++) {
          let value = r % 2 === 0;
          matrix.set(r, 6, value, !0), matrix.set(6, r, value, !0);
        }
      }
      function setupAlignmentPattern(matrix, version) {
        let pos = AlignmentPattern.getPositions(version);
        for (let i = 0; i < pos.length; i++) {
          let row = pos[i][0], col = pos[i][1];
          for (let r = -2; r <= 2; r++)
            for (let c = -2; c <= 2; c++)
              r === -2 || r === 2 || c === -2 || c === 2 || r === 0 && c === 0 ? matrix.set(row + r, col + c, !0, !0) : matrix.set(row + r, col + c, !1, !0);
        }
      }
      function setupVersionInfo(matrix, version) {
        let size = matrix.size, bits = Version.getEncodedBits(version), row, col, mod;
        for (let i = 0; i < 18; i++)
          row = Math.floor(i / 3), col = i % 3 + size - 8 - 3, mod = (bits >> i & 1) === 1, matrix.set(row, col, mod, !0), matrix.set(col, row, mod, !0);
      }
      function setupFormatInfo(matrix, errorCorrectionLevel, maskPattern) {
        let size = matrix.size, bits = FormatInfo.getEncodedBits(errorCorrectionLevel, maskPattern), i, mod;
        for (i = 0; i < 15; i++)
          mod = (bits >> i & 1) === 1, i < 6 ? matrix.set(i, 8, mod, !0) : i < 8 ? matrix.set(i + 1, 8, mod, !0) : matrix.set(size - 15 + i, 8, mod, !0), i < 8 ? matrix.set(8, size - i - 1, mod, !0) : i < 9 ? matrix.set(8, 15 - i - 1 + 1, mod, !0) : matrix.set(8, 15 - i - 1, mod, !0);
        matrix.set(size - 8, 8, 1, !0);
      }
      function setupData(matrix, data) {
        let size = matrix.size, inc = -1, row = size - 1, bitIndex = 7, byteIndex = 0;
        for (let col = size - 1; col > 0; col -= 2)
          for (col === 6 && col--; ; ) {
            for (let c = 0; c < 2; c++)
              if (!matrix.isReserved(row, col - c)) {
                let dark = !1;
                byteIndex < data.length && (dark = (data[byteIndex] >>> bitIndex & 1) === 1), matrix.set(row, col - c, dark), bitIndex--, bitIndex === -1 && (byteIndex++, bitIndex = 7);
              }
            if (row += inc, row < 0 || size <= row) {
              row -= inc, inc = -inc;
              break;
            }
          }
      }
      function createData(version, errorCorrectionLevel, segments) {
        let buffer = new BitBuffer();
        segments.forEach(function(data) {
          buffer.put(data.mode.bit, 4), buffer.put(data.getLength(), Mode.getCharCountIndicator(data.mode, version)), data.write(buffer);
        });
        let totalCodewords = Utils.getSymbolTotalCodewords(version), ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel), dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
        for (buffer.getLengthInBits() + 4 <= dataTotalCodewordsBits && buffer.put(0, 4); buffer.getLengthInBits() % 8 !== 0; )
          buffer.putBit(0);
        let remainingByte = (dataTotalCodewordsBits - buffer.getLengthInBits()) / 8;
        for (let i = 0; i < remainingByte; i++)
          buffer.put(i % 2 ? 17 : 236, 8);
        return createCodewords(buffer, version, errorCorrectionLevel);
      }
      function createCodewords(bitBuffer, version, errorCorrectionLevel) {
        let totalCodewords = Utils.getSymbolTotalCodewords(version), ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel), dataTotalCodewords = totalCodewords - ecTotalCodewords, ecTotalBlocks = ECCode.getBlocksCount(version, errorCorrectionLevel), blocksInGroup2 = totalCodewords % ecTotalBlocks, blocksInGroup1 = ecTotalBlocks - blocksInGroup2, totalCodewordsInGroup1 = Math.floor(totalCodewords / ecTotalBlocks), dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / ecTotalBlocks), dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1, ecCount = totalCodewordsInGroup1 - dataCodewordsInGroup1, rs = new ReedSolomonEncoder(ecCount), offset = 0, dcData = new Array(ecTotalBlocks), ecData = new Array(ecTotalBlocks), maxDataSize = 0, buffer = new Uint8Array(bitBuffer.buffer);
        for (let b = 0; b < ecTotalBlocks; b++) {
          let dataSize = b < blocksInGroup1 ? dataCodewordsInGroup1 : dataCodewordsInGroup2;
          dcData[b] = buffer.slice(offset, offset + dataSize), ecData[b] = rs.encode(dcData[b]), offset += dataSize, maxDataSize = Math.max(maxDataSize, dataSize);
        }
        let data = new Uint8Array(totalCodewords), index = 0, i, r;
        for (i = 0; i < maxDataSize; i++)
          for (r = 0; r < ecTotalBlocks; r++)
            i < dcData[r].length && (data[index++] = dcData[r][i]);
        for (i = 0; i < ecCount; i++)
          for (r = 0; r < ecTotalBlocks; r++)
            data[index++] = ecData[r][i];
        return data;
      }
      function createSymbol(data, version, errorCorrectionLevel, maskPattern) {
        let segments;
        if (Array.isArray(data))
          segments = Segments.fromArray(data);
        else if (typeof data == "string") {
          let estimatedVersion = version;
          if (!estimatedVersion) {
            let rawSegments = Segments.rawSplit(data);
            estimatedVersion = Version.getBestVersionForData(rawSegments, errorCorrectionLevel);
          }
          segments = Segments.fromString(data, estimatedVersion || 40);
        } else
          throw new Error("Invalid data");
        let bestVersion = Version.getBestVersionForData(segments, errorCorrectionLevel);
        if (!bestVersion)
          throw new Error("The amount of data is too big to be stored in a QR Code");
        if (!version)
          version = bestVersion;
        else if (version < bestVersion)
          throw new Error(
            `
The chosen QR Code version cannot contain this amount of data.
Minimum version required to store current data is: ` + bestVersion + `.
`
          );
        let dataBits = createData(version, errorCorrectionLevel, segments), moduleCount = Utils.getSymbolSize(version), modules = new BitMatrix(moduleCount);
        return setupFinderPattern(modules, version), setupTimingPattern(modules), setupAlignmentPattern(modules, version), setupFormatInfo(modules, errorCorrectionLevel, 0), version >= 7 && setupVersionInfo(modules, version), setupData(modules, dataBits), isNaN(maskPattern) && (maskPattern = MaskPattern.getBestMask(
          modules,
          setupFormatInfo.bind(null, modules, errorCorrectionLevel)
        )), MaskPattern.applyMask(maskPattern, modules), setupFormatInfo(modules, errorCorrectionLevel, maskPattern), {
          modules,
          version,
          errorCorrectionLevel,
          maskPattern,
          segments
        };
      }
      exports.create = function(data, options) {
        if (typeof data > "u" || data === "")
          throw new Error("No input text");
        let errorCorrectionLevel = ECLevel.M, version, mask;
        return typeof options < "u" && (errorCorrectionLevel = ECLevel.from(options.errorCorrectionLevel, ECLevel.M), version = Version.from(options.version), mask = MaskPattern.from(options.maskPattern), options.toSJISFunc && Utils.setToSJISFunction(options.toSJISFunc)), createSymbol(data, version, errorCorrectionLevel, mask);
      };
    }
  });

  // node_modules/qrcode/lib/renderer/utils.js
  var require_utils2 = __commonJS({
    "node_modules/qrcode/lib/renderer/utils.js"(exports) {
      function hex2rgba(hex) {
        if (typeof hex == "number" && (hex = hex.toString()), typeof hex != "string")
          throw new Error("Color should be defined as hex string");
        let hexCode = hex.slice().replace("#", "").split("");
        if (hexCode.length < 3 || hexCode.length === 5 || hexCode.length > 8)
          throw new Error("Invalid hex color: " + hex);
        (hexCode.length === 3 || hexCode.length === 4) && (hexCode = Array.prototype.concat.apply([], hexCode.map(function(c) {
          return [c, c];
        }))), hexCode.length === 6 && hexCode.push("F", "F");
        let hexValue = parseInt(hexCode.join(""), 16);
        return {
          r: hexValue >> 24 & 255,
          g: hexValue >> 16 & 255,
          b: hexValue >> 8 & 255,
          a: hexValue & 255,
          hex: "#" + hexCode.slice(0, 6).join("")
        };
      }
      exports.getOptions = function(options) {
        options || (options = {}), options.color || (options.color = {});
        let margin = typeof options.margin > "u" || options.margin === null || options.margin < 0 ? 4 : options.margin, width = options.width && options.width >= 21 ? options.width : void 0, scale = options.scale || 4;
        return {
          width,
          scale: width ? 4 : scale,
          margin,
          color: {
            dark: hex2rgba(options.color.dark || "#000000ff"),
            light: hex2rgba(options.color.light || "#ffffffff")
          },
          type: options.type,
          rendererOpts: options.rendererOpts || {}
        };
      };
      exports.getScale = function(qrSize, opts) {
        return opts.width && opts.width >= qrSize + opts.margin * 2 ? opts.width / (qrSize + opts.margin * 2) : opts.scale;
      };
      exports.getImageWidth = function(qrSize, opts) {
        let scale = exports.getScale(qrSize, opts);
        return Math.floor((qrSize + opts.margin * 2) * scale);
      };
      exports.qrToImageData = function(imgData, qr, opts) {
        let size = qr.modules.size, data = qr.modules.data, scale = exports.getScale(size, opts), symbolSize = Math.floor((size + opts.margin * 2) * scale), scaledMargin = opts.margin * scale, palette = [opts.color.light, opts.color.dark];
        for (let i = 0; i < symbolSize; i++)
          for (let j = 0; j < symbolSize; j++) {
            let posDst = (i * symbolSize + j) * 4, pxColor = opts.color.light;
            if (i >= scaledMargin && j >= scaledMargin && i < symbolSize - scaledMargin && j < symbolSize - scaledMargin) {
              let iSrc = Math.floor((i - scaledMargin) / scale), jSrc = Math.floor((j - scaledMargin) / scale);
              pxColor = palette[data[iSrc * size + jSrc] ? 1 : 0];
            }
            imgData[posDst++] = pxColor.r, imgData[posDst++] = pxColor.g, imgData[posDst++] = pxColor.b, imgData[posDst] = pxColor.a;
          }
      };
    }
  });

  // node_modules/qrcode/lib/renderer/canvas.js
  var require_canvas = __commonJS({
    "node_modules/qrcode/lib/renderer/canvas.js"(exports) {
      var Utils = require_utils2();
      function clearCanvas(ctx, canvas, size) {
        ctx.clearRect(0, 0, canvas.width, canvas.height), canvas.style || (canvas.style = {}), canvas.height = size, canvas.width = size, canvas.style.height = size + "px", canvas.style.width = size + "px";
      }
      function getCanvasElement() {
        try {
          return document.createElement("canvas");
        } catch {
          throw new Error("You need to specify a canvas element");
        }
      }
      exports.render = function(qrData, canvas, options) {
        let opts = options, canvasEl = canvas;
        typeof opts > "u" && (!canvas || !canvas.getContext) && (opts = canvas, canvas = void 0), canvas || (canvasEl = getCanvasElement()), opts = Utils.getOptions(opts);
        let size = Utils.getImageWidth(qrData.modules.size, opts), ctx = canvasEl.getContext("2d"), image = ctx.createImageData(size, size);
        return Utils.qrToImageData(image.data, qrData, opts), clearCanvas(ctx, canvasEl, size), ctx.putImageData(image, 0, 0), canvasEl;
      };
      exports.renderToDataURL = function(qrData, canvas, options) {
        let opts = options;
        typeof opts > "u" && (!canvas || !canvas.getContext) && (opts = canvas, canvas = void 0), opts || (opts = {});
        let canvasEl = exports.render(qrData, canvas, opts), type = opts.type || "image/png", rendererOpts = opts.rendererOpts || {};
        return canvasEl.toDataURL(type, rendererOpts.quality);
      };
    }
  });

  // node_modules/qrcode/lib/renderer/svg-tag.js
  var require_svg_tag = __commonJS({
    "node_modules/qrcode/lib/renderer/svg-tag.js"(exports) {
      var Utils = require_utils2();
      function getColorAttrib(color, attrib) {
        let alpha = color.a / 255, str = attrib + '="' + color.hex + '"';
        return alpha < 1 ? str + " " + attrib + '-opacity="' + alpha.toFixed(2).slice(1) + '"' : str;
      }
      function svgCmd(cmd, x, y) {
        let str = cmd + x;
        return typeof y < "u" && (str += " " + y), str;
      }
      function qrToPath(data, size, margin) {
        let path = "", moveBy = 0, newRow = !1, lineLength = 0;
        for (let i = 0; i < data.length; i++) {
          let col = Math.floor(i % size), row = Math.floor(i / size);
          !col && !newRow && (newRow = !0), data[i] ? (lineLength++, i > 0 && col > 0 && data[i - 1] || (path += newRow ? svgCmd("M", col + margin, 0.5 + row + margin) : svgCmd("m", moveBy, 0), moveBy = 0, newRow = !1), col + 1 < size && data[i + 1] || (path += svgCmd("h", lineLength), lineLength = 0)) : moveBy++;
        }
        return path;
      }
      exports.render = function(qrData, options, cb) {
        let opts = Utils.getOptions(options), size = qrData.modules.size, data = qrData.modules.data, qrcodesize = size + opts.margin * 2, bg = opts.color.light.a ? "<path " + getColorAttrib(opts.color.light, "fill") + ' d="M0 0h' + qrcodesize + "v" + qrcodesize + 'H0z"/>' : "", path = "<path " + getColorAttrib(opts.color.dark, "stroke") + ' d="' + qrToPath(data, size, opts.margin) + '"/>', viewBox = 'viewBox="0 0 ' + qrcodesize + " " + qrcodesize + '"', svgTag = '<svg xmlns="http://www.w3.org/2000/svg" ' + (opts.width ? 'width="' + opts.width + '" height="' + opts.width + '" ' : "") + viewBox + ' shape-rendering="crispEdges">' + bg + path + `</svg>
`;
        return typeof cb == "function" && cb(null, svgTag), svgTag;
      };
    }
  });

  // node_modules/qrcode/lib/browser.js
  var require_browser = __commonJS({
    "node_modules/qrcode/lib/browser.js"(exports) {
      var canPromise = require_can_promise(), QRCode2 = require_qrcode(), CanvasRenderer = require_canvas(), SvgRenderer = require_svg_tag();
      function renderCanvas(renderFunc, canvas, text, opts, cb) {
        let args = [].slice.call(arguments, 1), argsNum = args.length, isLastArgCb = typeof args[argsNum - 1] == "function";
        if (!isLastArgCb && !canPromise())
          throw new Error("Callback required as last argument");
        if (isLastArgCb) {
          if (argsNum < 2)
            throw new Error("Too few arguments provided");
          argsNum === 2 ? (cb = text, text = canvas, canvas = opts = void 0) : argsNum === 3 && (canvas.getContext && typeof cb > "u" ? (cb = opts, opts = void 0) : (cb = opts, opts = text, text = canvas, canvas = void 0));
        } else {
          if (argsNum < 1)
            throw new Error("Too few arguments provided");
          return argsNum === 1 ? (text = canvas, canvas = opts = void 0) : argsNum === 2 && !canvas.getContext && (opts = text, text = canvas, canvas = void 0), new Promise(function(resolve, reject) {
            try {
              let data = QRCode2.create(text, opts);
              resolve(renderFunc(data, canvas, opts));
            } catch (e) {
              reject(e);
            }
          });
        }
        try {
          let data = QRCode2.create(text, opts);
          cb(null, renderFunc(data, canvas, opts));
        } catch (e) {
          cb(e);
        }
      }
      exports.create = QRCode2.create;
      exports.toCanvas = renderCanvas.bind(null, CanvasRenderer.render);
      exports.toDataURL = renderCanvas.bind(null, CanvasRenderer.renderToDataURL);
      exports.toString = renderCanvas.bind(null, function(data, _, opts) {
        return SvgRenderer.render(data, opts);
      });
    }
  });

  // src/control-contract.ts
  var CONTROL_RPC_PREFIX = "/dsh-lango", EVENTS_ENDPOINT = "events";

  // src/client/locale.ts
  var localeNamespace = "dsh-lango", en = {
    title: "Lango",
    open: "Open Lango",
    close: "Close",
    listening: "Listening",
    notListening: "Not listening",
    noAddress: "No private network address",
    addresses: "Addresses",
    fingerprint: "Fingerprint",
    pairDevice: "Pair a device",
    pairScan: "Scan with dsh-Go",
    pairExpires: "Expires in {time}",
    copyLink: "Copy link",
    copied: "Copied",
    cancel: "Cancel",
    regenerate: "New code",
    requestTitle: "{name} wants to pair",
    requestHint: "Allow only if the phone shows the same code.",
    confirmationCode: "Confirmation code",
    allow: "Allow",
    deny: "Deny",
    devices: "Devices",
    sidebarEntry: "Show in sidebar",
    noDevices: "No paired devices",
    online: "Connected",
    offline: "Offline",
    lastSeen: "Last seen {time}",
    neverSeen: "Paired {time}",
    latency: "Latency",
    measure: "Measure latency",
    rename: "Rename",
    save: "Save",
    revoke: "Remove",
    revokeConfirm: "Remove?",
    unmeasured: "\u2014",
    justNow: "just now",
    minutesAgo: "{n} min ago",
    hoursAgo: "{n} h ago",
    daysAgo: "{n} d ago",
    unavailable: "Lango is not running on this Harness.",
    failed: "The request failed.",
    errorNOT_LISTENING: "Lango is not listening on any private network address.",
    errorNO_ADDRESS: "Connect to a LAN, WireGuard or Tailscale network first.",
    errorREQUEST_GONE: "The phone stopped waiting.",
    errorDEVICE_NOT_FOUND: "That device is no longer paired."
  }, zh = {
    title: "Lango",
    open: "\u6253\u5F00 Lango",
    close: "\u5173\u95ED",
    listening: "\u76D1\u542C\u4E2D",
    notListening: "\u672A\u76D1\u542C",
    noAddress: "\u6CA1\u6709\u79C1\u6709\u7F51\u7EDC\u5730\u5740",
    addresses: "\u5730\u5740",
    fingerprint: "\u6307\u7EB9",
    pairDevice: "\u914D\u5BF9\u65B0\u8BBE\u5907",
    pairScan: "\u7528 dsh-Go \u626B\u7801",
    pairExpires: "{time} \u540E\u5931\u6548",
    copyLink: "\u590D\u5236\u94FE\u63A5",
    copied: "\u5DF2\u590D\u5236",
    cancel: "\u53D6\u6D88",
    regenerate: "\u6362\u4E00\u4E2A\u7801",
    requestTitle: "{name} \u8BF7\u6C42\u914D\u5BF9",
    requestHint: "\u624B\u673A\u4E0A\u663E\u793A\u7684\u786E\u8BA4\u7801\u4E00\u81F4\u65F6\u624D\u5141\u8BB8\u3002",
    confirmationCode: "\u786E\u8BA4\u7801",
    allow: "\u5141\u8BB8",
    deny: "\u62D2\u7EDD",
    devices: "\u8BBE\u5907",
    sidebarEntry: "\u5728\u4FA7\u680F\u663E\u793A",
    noDevices: "\u8FD8\u6CA1\u6709\u914D\u5BF9\u7684\u8BBE\u5907",
    online: "\u5DF2\u8FDE\u63A5",
    offline: "\u79BB\u7EBF",
    lastSeen: "{time}\u8FDE\u63A5\u8FC7",
    neverSeen: "{time}\u914D\u5BF9",
    latency: "\u5EF6\u8FDF",
    measure: "\u6D4B\u91CF\u5EF6\u8FDF",
    rename: "\u91CD\u547D\u540D",
    save: "\u4FDD\u5B58",
    revoke: "\u79FB\u9664",
    revokeConfirm: "\u786E\u8BA4\u79FB\u9664",
    unmeasured: "\u2014",
    justNow: "\u521A\u521A",
    minutesAgo: "{n} \u5206\u949F\u524D",
    hoursAgo: "{n} \u5C0F\u65F6\u524D",
    daysAgo: "{n} \u5929\u524D",
    unavailable: "\u6B64 Harness \u4E0A\u7684 Lango \u672A\u8FD0\u884C\u3002",
    failed: "\u64CD\u4F5C\u5931\u8D25\u3002",
    errorNOT_LISTENING: "Lango \u6CA1\u6709\u5728\u4EFB\u4F55\u79C1\u6709\u7F51\u7EDC\u5730\u5740\u4E0A\u76D1\u542C\u3002",
    errorNO_ADDRESS: "\u8BF7\u5148\u8FDE\u63A5\u5C40\u57DF\u7F51\u3001WireGuard \u6216 Tailscale\u3002",
    errorREQUEST_GONE: "\u624B\u673A\u5DF2\u4E0D\u518D\u7B49\u5F85\u3002",
    errorDEVICE_NOT_FOUND: "\u8BE5\u8BBE\u5907\u5DF2\u4E0D\u5728\u914D\u5BF9\u5217\u8868\u4E2D\u3002"
  };
  function staticTranslate(dictionary) {
    return (key, params) => {
      let text = dictionary[key] ?? key;
      for (let [name, value] of Object.entries(params ?? {})) text = text.split(`{${name}}`).join(String(value));
      return text;
    };
  }

  // src/client/qr.ts
  var import_qrcode = __toESM(require_browser(), 1);
  function qrPath(text) {
    let modules = import_qrcode.default.create(text, { errorCorrectionLevel: "M" }).modules, size = modules.size, path = "";
    for (let row = 0; row < size; row += 1) {
      let column = 0;
      for (; column < size; ) {
        if (modules.get(row, column) !== 1) {
          column += 1;
          continue;
        }
        let start = column;
        for (; column < size && modules.get(row, column) === 1; ) column += 1;
        path += `M${start} ${row}h${column - start}v1h${start - column}z`;
      }
    }
    return { size, path };
  }

  // src/client/panel.ts
  var KNOWN_ERRORS = /* @__PURE__ */ new Set(["NOT_LISTENING", "NO_ADDRESS", "REQUEST_GONE", "DEVICE_NOT_FOUND"]);
  function createLangoComponents(React, portal) {
    let h = React.createElement, icon = (d, size = 16) => h("svg", {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": !0
    }, h("path", { d })), icons = {
      phone: (size) => icon("M8 2.5h8a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2zM11 18.5h2", size),
      close: () => icon("M6 6l12 12M18 6L6 18"),
      pencil: () => icon("M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4", 14),
      trash: () => icon("M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3", 14),
      plus: () => icon("M12 5v14M5 12h14", 15)
    };
    function useFeed(feed) {
      return React.useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot);
    }
    function useNow(active) {
      let [now, setNow] = React.useState(Date.now());
      return React.useEffect(() => {
        if (!active) return;
        setNow(Date.now());
        let timer = setInterval(() => setNow(Date.now()), 1e3);
        return () => clearInterval(timer);
      }, [active]), now;
    }
    function errorText(reason, t) {
      let code = typeof reason == "object" && reason !== null ? reason.code : void 0;
      return typeof code == "string" && KNOWN_ERRORS.has(code) ? t(`error${code}`) : t("failed");
    }
    function relative(at, now, t) {
      let minutes = Math.floor((now - at) / 6e4);
      if (minutes < 1) return t("justNow");
      if (minutes < 60) return t("minutesAgo", { n: minutes });
      let hours = Math.floor(minutes / 60);
      return hours < 24 ? t("hoursAgo", { n: hours }) : t("daysAgo", { n: Math.floor(hours / 24) });
    }
    function countdown(ms) {
      let seconds = Math.max(0, Math.ceil(ms / 1e3));
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }
    function platformLabel(platform) {
      return platform.includes("android") ? "Android" : platform.includes("ios") ? "iOS" : platform.includes("ohos") || platform.includes("harmony") ? "HarmonyOS" : platform;
    }
    function groupCode(code) {
      return `${code.slice(0, 3)} ${code.slice(3)}`;
    }
    function Qr(props) {
      let qr = React.useMemo(() => qrPath(props.text), [props.text]);
      return h(
        "div",
        { className: "lgo-qr", role: "img", "aria-label": props.label },
        h(
          "svg",
          { viewBox: `0 0 ${qr.size} ${qr.size}`, shapeRendering: "crispEdges" },
          h("path", { d: qr.path, fill: "#0b0d12" })
        )
      );
    }
    function Meter(props) {
      let span = Math.max(1, props.to - props.from), left = Math.min(1, Math.max(0, (props.to - props.now) / span));
      return h("div", { className: "lgo-meter" }, h("i", { style: { width: `${left * 100}%` } }));
    }
    function HostSummary(props) {
      let { host } = props.state, { t } = props, status = host.listening ? host.pairable.length > 0 ? "on" : "warn" : "bad";
      return h(
        "div",
        { className: "lgo-host" },
        h(
          "div",
          { className: "lgo-host-main" },
          h(
            "div",
            { className: "lgo-host-name" },
            h("span", { className: `lgo-dot ${status === "on" ? "is-on" : status === "bad" ? "is-bad" : ""}`, title: t(host.listening ? "listening" : "notListening") }),
            h("span", null, host.name)
          ),
          host.pairable.length > 0 ? h("div", { className: "lgo-chips", "aria-label": t("addresses") }, host.pairable.map((address) => h("span", { key: address, className: "lgo-chip" }, address))) : h("div", { className: "lgo-meta" }, t(host.listening ? "noAddress" : "notListening")),
          h("div", { className: "lgo-meta" }, `${t("fingerprint")} `, h("span", { className: "lgo-mono" }, host.fingerprint))
        )
      );
    }
    function PairingIdle(props) {
      let { t } = props, ready = props.state.host.listening && props.state.host.pairable.length > 0;
      return h("button", {
        type: "button",
        className: "lgo-btn is-primary",
        disabled: !ready || props.busy !== void 0,
        onClick: () => {
          props.onOpen(), props.run("open", "pairing.open");
        }
      }, icons.plus(), t("pairDevice"));
    }
    function PairingQr(props) {
      let { t, pairing } = props, now = useNow(!0), [copied, setCopied] = React.useState(!1), openedAt = React.useRef(now);
      React.useEffect(() => {
        openedAt.current = Date.now();
      }, [pairing.link]);
      let copy = () => {
        navigator.clipboard?.writeText(pairing.link).then(() => {
          setCopied(!0), setTimeout(() => setCopied(!1), 1500);
        }, () => {
        });
      };
      return h(
        "div",
        { className: "lgo-card lgo-pair" },
        h(Qr, { text: pairing.link, label: t("pairScan") }),
        h(
          "div",
          { className: "lgo-pair-side" },
          h("strong", null, t("pairScan")),
          h("div", { className: "lgo-meta lgo-countdown" }, t("pairExpires", { time: countdown(pairing.expiresAt - now) })),
          h(Meter, { from: openedAt.current, to: pairing.expiresAt, now }),
          h(
            "div",
            { className: "lgo-actions" },
            h("button", { type: "button", className: "lgo-btn is-small", onClick: copy }, t(copied ? "copied" : "copyLink")),
            h("button", { type: "button", className: "lgo-btn is-small", disabled: props.busy !== void 0, onClick: () => {
              props.onOpen(), props.run("open", "pairing.open");
            } }, t("regenerate")),
            h("button", { type: "button", className: "lgo-btn is-small", disabled: props.busy !== void 0, onClick: () => void props.run("close", "pairing.close") }, t("cancel"))
          )
        )
      );
    }
    function PairingApproval(props) {
      let { t, request } = props, now = useNow(!0), decide = (approve) => props.run(approve ? "allow" : "deny", "pairing.decide", { requestId: request.id, approve });
      return h(
        "div",
        { className: "lgo-card lgo-request", role: "alertdialog", "aria-label": t("requestTitle", { name: request.name }) },
        h(
          "div",
          { className: "lgo-request-head" },
          h("div", { className: "lgo-device-icon" }, icons.phone(18)),
          h(
            "div",
            { style: { minWidth: 0 } },
            h("strong", null, t("requestTitle", { name: request.name })),
            h("div", { className: "lgo-meta" }, `${platformLabel(request.platform)} \xB7 ${request.address}`)
          )
        ),
        h(
          "div",
          { className: "lgo-code" },
          h("span", { className: "lgo-meta" }, t("confirmationCode")),
          h("b", null, groupCode(request.confirmationCode))
        ),
        h(
          "dl",
          { className: "lgo-kv" },
          h("dt", null, t("fingerprint")),
          h("dd", { className: "lgo-mono" }, request.fingerprint)
        ),
        h(Meter, { from: request.requestedAt, to: request.expiresAt, now }),
        h(
          "div",
          { className: "lgo-actions" },
          h("span", { className: "lgo-meta lgo-countdown", style: { marginRight: "auto", alignSelf: "center" } }, t("requestHint")),
          h("button", { type: "button", className: "lgo-btn", disabled: props.busy !== void 0, onClick: () => void decide(!1) }, t("deny")),
          h("button", { type: "button", className: "lgo-btn is-primary", disabled: props.busy !== void 0, onClick: () => void decide(!0) }, t("allow"))
        )
      );
    }
    function RttBadge(props) {
      let { device, t } = props, rtt = device.rttMs, grade = rtt === void 0 ? "" : rtt < 30 ? "is-good" : rtt < 120 ? "is-fair" : "is-poor";
      return h("button", {
        type: "button",
        className: `lgo-rtt ${grade} ${props.busy ? "is-busy" : ""}`,
        title: t("measure"),
        "aria-label": `${t("latency")} ${rtt === void 0 ? t("unmeasured") : `${Math.round(rtt)} ms`}`,
        disabled: props.busy,
        onClick: () => void props.run(`measure:${device.deviceId}`, "device.measure", { deviceId: device.deviceId })
      }, h("i"), rtt === void 0 ? t("unmeasured") : `${rtt < 1 ? "<1" : Math.round(rtt)} ms`);
    }
    function DeviceRow(props) {
      let { device, t } = props, [editing, setEditing] = React.useState(!1), [name, setName] = React.useState(device.name), [confirming, setConfirming] = React.useState(!1);
      React.useEffect(() => {
        if (!confirming) return;
        let timer = setTimeout(() => setConfirming(!1), 3e3);
        return () => clearTimeout(timer);
      }, [confirming]);
      let save = async () => {
        let next = name.trim();
        setEditing(!1), next !== "" && next !== device.name && await props.run(`rename:${device.deviceId}`, "device.rename", { deviceId: device.deviceId, name: next });
      }, meta = [platformLabel(device.platform)];
      return device.online && device.address !== void 0 ? meta.push(device.address) : device.online || meta.push(device.lastSeenAt === void 0 ? t("neverSeen", { time: relative(device.pairedAt, props.now, t) }) : t("lastSeen", { time: relative(device.lastSeenAt, props.now, t) })), h(
        "div",
        { className: "lgo-row" },
        h("span", { className: `lgo-dot ${device.online ? "is-on" : ""}`, title: t(device.online ? "online" : "offline") }),
        h(
          "div",
          { className: "lgo-row-main" },
          editing ? h("input", {
            className: "lgo-rename",
            value: name,
            maxLength: 80,
            autoFocus: !0,
            "aria-label": t("rename"),
            onChange: (event) => setName(event.target.value),
            onBlur: () => void save(),
            onKeyDown: (event) => {
              event.key === "Enter" && save(), event.key === "Escape" && (setName(device.name), setEditing(!1));
            }
          }) : h("div", { className: "lgo-row-name" }, h("span", { title: device.fingerprint }, device.name)),
          h("div", { className: "lgo-row-meta" }, meta.map((item) => h("span", { key: item }, item)))
        ),
        device.online ? h(RttBadge, { device, busy: props.busy === `measure:${device.deviceId}`, run: props.run, t }) : null,
        h(
          "div",
          { className: `lgo-row-tools ${confirming ? "is-pinned" : ""}` },
          confirming ? h("button", {
            type: "button",
            className: "lgo-btn is-small is-danger",
            disabled: props.busy !== void 0,
            onClick: () => void props.run(`revoke:${device.deviceId}`, "device.revoke", { deviceId: device.deviceId })
          }, t("revokeConfirm")) : h(
            React.Fragment,
            null,
            h("button", { type: "button", className: "lgo-icon-btn", title: t("rename"), "aria-label": t("rename"), onClick: () => {
              setName(device.name), setEditing(!0);
            } }, icons.pencil()),
            h("button", { type: "button", className: "lgo-icon-btn", title: t("revoke"), "aria-label": t("revoke"), onClick: () => setConfirming(!0) }, icons.trash())
          )
        )
      );
    }
    function Devices(props) {
      let { t, state } = props, now = useNow(state.devices.length > 0);
      return h(
        "section",
        null,
        h(
          "div",
          { className: "lgo-section-head" },
          h("h3", null, t("devices")),
          state.devices.length > 0 ? h("span", { className: "lgo-count" }, String(state.devices.length)) : null
        ),
        state.devices.length === 0 ? h("div", { className: "lgo-empty" }, t("noDevices")) : h("div", { className: "lgo-list" }, state.devices.map((device) => h(DeviceRow, { key: device.deviceId, device, busy: props.busy, run: props.run, t, now })))
      );
    }
    function Switch(props) {
      return h(
        "label",
        { className: "lgo-switch-row" },
        h("span", null, props.label),
        h("button", {
          type: "button",
          role: "switch",
          "aria-checked": props.checked,
          "aria-label": props.label,
          className: `lgo-switch ${props.checked ? "is-on" : ""}`,
          disabled: props.disabled,
          onClick: () => props.onChange(!props.checked)
        }, h("i"))
      );
    }
    function LangoPanel(props) {
      let { t } = props, snapshot = useFeed(props.feed), [busy, setBusy] = React.useState(void 0), [error, setError] = React.useState(void 0), openedHere = React.useRef(!1);
      React.useEffect(() => () => {
        openedHere.current && props.control("pairing.close").then((state2) => props.feed.publish(state2), () => {
        });
      }, []);
      let run = async (key, endpoint, payload) => {
        setBusy(key), setError(void 0);
        try {
          let result = await props.control(endpoint, payload), state2 = isState(result) ? result : result?.state;
          return isState(state2) && props.feed.publish(state2), (endpoint === "pairing.close" || endpoint === "pairing.decide") && (openedHere.current = !1), result;
        } catch (reason) {
          setError(errorText(reason, t));
          return;
        } finally {
          setBusy(void 0);
        }
      };
      if (snapshot.phase === "loading") return h("div", { className: "lgo-panel", "aria-busy": !0 });
      if (snapshot.phase === "unavailable") return h("div", { className: "lgo-panel" }, h("div", { className: "lgo-empty" }, t("unavailable")));
      let { state } = snapshot, onOpen = () => {
        openedHere.current = !0;
      };
      return h(
        "div",
        { className: "lgo-panel" },
        h(HostSummary, { state, t }),
        state.pairing?.request !== void 0 ? h(PairingApproval, { request: state.pairing.request, busy, run, t }) : state.pairing !== void 0 ? h(PairingQr, { pairing: state.pairing, busy, run, t, onOpen }) : h("div", null, h(PairingIdle, { state, busy, run, t, onOpen })),
        h(Devices, { state, busy, run, t }),
        h(Switch, {
          label: t("sidebarEntry"),
          checked: state.preferences.sidebarEntry,
          disabled: busy === "preferences",
          onChange: (next) => void run("preferences", "preferences.set", { sidebarEntry: next })
        }),
        error === void 0 ? null : h("p", { className: "lgo-error", role: "alert" }, error)
      );
    }
    function LangoDialog(props) {
      React.useEffect(() => {
        let onKey = (event) => {
          event.key === "Escape" && props.onClose();
        };
        return window.addEventListener("keydown", onKey), () => window.removeEventListener("keydown", onKey);
      }, []);
      let dialog = h("div", {
        className: "lgo-backdrop",
        role: "presentation",
        onMouseDown: (event) => {
          event.target === event.currentTarget && props.onClose();
        }
      }, h(
        "section",
        { className: "lgo-dialog", role: "dialog", "aria-modal": !0, "aria-label": props.t("title") },
        h(
          "div",
          { className: "lgo-dialog-head" },
          h("strong", null, props.t("title")),
          h("span", { className: "lgo-spacer" }),
          h("button", { type: "button", className: "lgo-icon-btn", "aria-label": props.t("close"), onClick: props.onClose }, icons.close())
        ),
        h("div", { className: "lgo-dialog-body" }, h(LangoPanel, props))
      ));
      return renderBodyPortal(dialog);
    }
    function LangoSidebarEntry(props) {
      let snapshot = useFeed(props.feed), [open, setOpen] = React.useState(!1), state = snapshot.phase === "ready" ? snapshot.state : void 0;
      if (state?.preferences.sidebarEntry !== !0) return null;
      let waiting = state?.pairing?.request !== void 0, online = state?.devices.some((device) => device.online) ?? !1;
      return h(
        "div",
        { className: `lgo-entry ${props.wide ? "is-wide" : ""}` },
        h(
          "button",
          {
            type: "button",
            className: "lgo-entry-btn",
            title: props.t("open"),
            "aria-label": props.t("open"),
            onClick: () => setOpen(!0)
          },
          icons.phone(18),
          waiting || online ? h("span", { className: `lgo-badge ${waiting ? "is-alert" : ""}` }) : null,
          props.wide ? h("span", null, props.t("title")) : null
        ),
        open ? h(LangoDialog, { ...props, onClose: () => setOpen(!1) }) : null
      );
    }
    function LangoConfigCard(props) {
      return h("div", { className: "lgo-config", "data-dsh-lango-settings": !0 }, h(LangoPanel, props));
    }
    function renderBodyPortal(children) {
      if (typeof portal != "function" || typeof document > "u" || document.body === null) return children;
      try {
        return portal(children, document.body);
      } catch {
        return children;
      }
    }
    return { LangoPanel, LangoDialog, LangoSidebarEntry, LangoConfigCard };
  }
  function isState(value) {
    return typeof value == "object" && value !== null && "devices" in value && "host" in value;
  }

  // src/client/store.ts
  function createStateFeed(eventsUrl, control) {
    let snapshot = { phase: "loading" }, listeners = /* @__PURE__ */ new Set(), source, poll, silence, set = (next) => {
      snapshot = next;
      for (let listener of listeners) listener();
    }, read = () => {
      control("state").then((state) => set({ phase: "ready", state }), () => {
        snapshot.phase !== "ready" && set({ phase: "unavailable" });
      });
    }, startPolling = () => {
      source?.close(), source = void 0, poll === void 0 && (read(), poll = setInterval(read, 2e3));
    }, start = () => {
      if (typeof EventSource != "function") {
        startPolling();
        return;
      }
      try {
        source = new EventSource(eventsUrl);
      } catch {
        startPolling();
        return;
      }
      silence = setTimeout(startPolling, 4e3), source.onmessage = (event) => {
        silence !== void 0 && (clearTimeout(silence), silence = void 0);
        try {
          set({ phase: "ready", state: JSON.parse(String(event.data)) });
        } catch {
        }
      }, source.onerror = () => {
        source?.readyState === 2 && startPolling();
      };
    }, stop = () => {
      source?.close(), source = void 0, poll !== void 0 && clearInterval(poll), poll = void 0, silence !== void 0 && clearTimeout(silence), silence = void 0;
    };
    return {
      getSnapshot: () => snapshot,
      subscribe: (listener) => (listeners.add(listener), listeners.size === 1 && start(), () => {
        listeners.delete(listener), listeners.size === 0 && stop();
      }),
      publish: (state) => set({ phase: "ready", state }),
      close: () => {
        listeners.clear(), stop();
      }
    };
  }

  // src/client/style.ts
  var css = `
.lgo-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:var(--dsw-alias-bg-mask-3,rgba(0,0,0,.32));-webkit-app-region:no-drag;animation:lgo-fade .14s ease-out}
.lgo-dialog{width:min(520px,100%);max-height:min(720px,calc(100vh - 40px));display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;box-shadow:var(--dsw-shadow-lv2,0 12px 40px rgba(0,0,0,.18));animation:lgo-rise .18s cubic-bezier(.2,.8,.2,1)}
.lgo-dialog-head{display:flex;align-items:center;gap:10px;padding:14px 16px 12px 18px;border-bottom:1px solid var(--dsw-alias-border-l1,var(--dsw-alias-border-l2))}
.lgo-dialog-head strong{font-size:15px;font-weight:600}
.lgo-dialog-body{overflow:auto;padding:16px 18px 18px}
.lgo-panel{display:grid;gap:18px;font-size:13px;line-height:1.5}
.lgo-panel button{font:inherit}
.lgo-icon-btn{width:28px;height:28px;display:inline-grid;place-items:center;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0}
.lgo-icon-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.lgo-icon-btn:disabled{opacity:.4;cursor:default}
.lgo-icon-btn:focus-visible,.lgo-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.lgo-spacer{flex:1}
.lgo-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:0 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap}
.lgo-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.lgo-btn:disabled{opacity:.45;cursor:default}
.lgo-btn.is-primary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:#fff}
.lgo-btn.is-primary:hover:not(:disabled){filter:brightness(1.06);background:var(--dsw-alias-brand-primary)}
.lgo-btn.is-danger{color:var(--dsw-alias-state-error-primary,#d14343)}
.lgo-btn.is-small{min-height:26px;padding:0 10px;font-size:12px;border-radius:7px}
.lgo-host{display:flex;align-items:flex-start;gap:12px}
.lgo-host-main{min-width:0;flex:1;display:grid;gap:4px}
.lgo-host-name{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600}
.lgo-chips{display:flex;flex-wrap:wrap;gap:6px}
.lgo-chip{font-family:var(--dsw-font-mono,ui-monospace,Consolas,monospace);font-size:11.5px;padding:1px 7px;border-radius:6px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary)}
.lgo-meta{color:var(--dsw-alias-label-tertiary);font-size:12px}
.lgo-mono{font-family:var(--dsw-font-mono,ui-monospace,Consolas,monospace);letter-spacing:.02em}
.lgo-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--dsw-alias-label-dimmed,#b7bcc6)}
.lgo-dot.is-on{background:var(--dsw-alias-state-success-primary,#2fa36b);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary,#2fa36b) 18%,transparent)}
.lgo-dot.is-bad{background:var(--dsw-alias-state-error-primary,#d14343)}
.lgo-card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2,transparent);padding:16px}
.lgo-pair{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center}
.lgo-qr{width:184px;height:184px;padding:10px;border-radius:10px;background:#fff;box-sizing:border-box;display:block}
.lgo-qr svg{display:block;width:100%;height:100%}
.lgo-pair-side{display:grid;gap:10px;align-content:center;min-width:0}
.lgo-pair-side strong{font-size:14px;font-weight:600}
.lgo-actions{display:flex;flex-wrap:wrap;gap:8px}
.lgo-countdown{font-variant-numeric:tabular-nums}
.lgo-meter{height:3px;border-radius:2px;background:var(--dsw-alias-bg-layer-3);overflow:hidden}
.lgo-meter>i{display:block;height:100%;background:var(--dsw-alias-brand-primary);transition:width 1s linear}
.lgo-request{display:grid;gap:14px;animation:lgo-rise .2s cubic-bezier(.2,.8,.2,1)}
.lgo-request-head{display:flex;align-items:center;gap:12px}
.lgo-device-icon{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;flex:none;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);color:var(--dsw-alias-brand-primary)}
.lgo-code{display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-3)}
.lgo-code b{font-family:var(--dsw-font-mono,ui-monospace,Consolas,monospace);font-size:30px;font-weight:600;letter-spacing:.12em;font-variant-numeric:tabular-nums}
.lgo-kv{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:12px}
.lgo-kv dt{color:var(--dsw-alias-label-tertiary)}
.lgo-kv dd{margin:0;min-width:0;overflow-wrap:anywhere}
.lgo-request .lgo-actions{justify-content:flex-end}
.lgo-section-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.lgo-section-head h3{margin:0;font-size:13px;font-weight:600}
.lgo-count{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.lgo-list{display:grid;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;overflow:hidden}
.lgo-row{display:flex;align-items:center;gap:12px;padding:10px 12px;min-height:52px;box-sizing:border-box}
.lgo-row+.lgo-row{border-top:1px solid var(--dsw-alias-border-l1,var(--dsw-alias-border-l2))}
.lgo-row-main{min-width:0;flex:1;display:grid;gap:2px}
.lgo-row-name{display:flex;align-items:center;gap:8px;font-weight:500;min-width:0}
.lgo-row-name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lgo-row-meta{display:flex;flex-wrap:wrap;gap:0 10px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.lgo-row-tools{display:flex;align-items:center;gap:2px;opacity:.0;transition:opacity .12s}
.lgo-row:hover .lgo-row-tools,.lgo-row:focus-within .lgo-row-tools,.lgo-row-tools.is-pinned{opacity:1}
.lgo-rtt{display:inline-flex;align-items:center;gap:5px;font-variant-numeric:tabular-nums;font-size:12px;padding:2px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);border:0;cursor:pointer}
.lgo-rtt:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.lgo-rtt i{width:6px;height:6px;border-radius:50%;background:currentColor}
.lgo-rtt.is-good i{background:var(--dsw-alias-state-success-primary,#2fa36b)}
.lgo-rtt.is-fair i{background:var(--dsw-alias-state-warning-primary,#c98a00)}
.lgo-rtt.is-poor i{background:var(--dsw-alias-state-error-primary,#d14343)}
.lgo-rtt.is-busy{opacity:.6}
.lgo-rename{flex:1;min-width:0;font:inherit;padding:3px 8px;border-radius:6px;border:1px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1);color:inherit;outline:none}
.lgo-empty{padding:22px 12px;text-align:center;color:var(--dsw-alias-label-tertiary);border:1px dashed var(--dsw-alias-border-l2);border-radius:12px}
.lgo-error{color:var(--dsw-alias-state-error-primary,#d14343);font-size:12px}
.lgo-entry{box-sizing:border-box;flex:none;display:block}
.lgo-entry-btn{position:relative;height:36px;min-width:36px;display:flex;align-items:center;justify-content:center;gap:6px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:14px}
.lgo-entry.is-wide .lgo-entry-btn{border-radius:8px;padding:0 8px;justify-content:flex-start;color:var(--dsw-alias-label-primary)}
.lgo-entry-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.lgo-entry-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.lgo-entry-btn .lgo-badge{position:absolute;top:7px;left:22px;width:7px;height:7px;border-radius:50%;border:1.5px solid var(--dsw-alias-bg-layer-1);background:var(--dsw-alias-state-success-primary,#2fa36b)}
.lgo-entry-btn .lgo-badge.is-alert{background:var(--dsw-alias-state-error-primary,#d14343);animation:lgo-pulse 1.2s ease-in-out infinite}
.lgo-config{margin-top:4px}
.lgo-switch-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:2px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.lgo-switch{position:relative;flex:none;width:34px;height:20px;padding:0;border:0;border-radius:999px;background:var(--dsw-alias-border-l4,#c9ced6);cursor:pointer;transition:background .15s}
.lgo-switch i{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .15s}
.lgo-switch.is-on{background:var(--dsw-alias-brand-primary)}
.lgo-switch.is-on i{transform:translateX(14px)}
.lgo-switch:disabled{opacity:.5;cursor:default}
.lgo-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
@keyframes lgo-fade{from{opacity:0}to{opacity:1}}
@keyframes lgo-rise{from{opacity:0;transform:translateY(6px) scale(.99)}to{opacity:1;transform:none}}
@keyframes lgo-pulse{50%{transform:scale(1.35)}}
@media (prefers-reduced-motion:reduce){.lgo-backdrop,.lgo-dialog,.lgo-request,.lgo-entry-btn .lgo-badge.is-alert{animation:none}}
@media (max-width:560px){.lgo-pair{grid-template-columns:1fr;justify-items:center;text-align:center}.lgo-pair-side .lgo-actions{justify-content:center}}
`;
  function installStyle(moduleId) {
    let style = document.createElement("style");
    return style.dataset.plugin = moduleId, style.textContent = css, document.head.append(style), () => style.remove();
  }

  // src/client/index.ts
  var MODULE_ID = "dsh-lango";
  window.__ModuleLoader__.load({
    id: MODULE_ID,
    factory: (require2) => {
      let module = { exports: {} }, React = require2("react"), portal = (() => {
        try {
          let reactDom = require2("react-dom");
          return typeof reactDom.createPortal == "function" ? reactDom.createPortal.bind(reactDom) : void 0;
        } catch {
          return;
        }
      })(), { LangoSidebarEntry, LangoConfigCard } = createLangoComponents(React, portal);
      function apply(ctx) {
        if (window.__DSH_LANGO_CLIENT_ACTIVE__) return;
        window.__DSH_LANGO_CLIENT_ACTIVE__ = !0, ctx.effect(() => () => {
          window.__DSH_LANGO_CLIENT_ACTIVE__ = !1;
        }, "dsh-lango: client singleton");
        let control = async (endpoint, payload = {}) => {
          let result = await ctx.connection.rpc.call(CONTROL_RPC_PREFIX, endpoint, payload);
          if (!result.ok)
            throw Object.assign(new Error(result.error?.message ?? "lango request failed"), { code: result.error?.code });
          return result.value;
        }, feed = createStateFeed(`${CONTROL_RPC_PREFIX.slice(1)}/${EVENTS_ENDPOINT}`, control);
        ctx.effect(() => () => feed.close(), "dsh-lango: state feed"), ctx.locale !== void 0 && ctx.effect(() => ctx.locale.register(localeNamespace, { zh, en }), "dsh-lango: dictionaries");
        let fallback = staticTranslate(navigator.language.toLowerCase().startsWith("zh") ? zh : en);
        ctx.effect(() => installStyle(MODULE_ID), "dsh-lango: styles");
        let base = () => ({
          control,
          feed,
          ...ctx.locale === void 0 ? { t: fallback } : {}
        });
        ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
          name: "sidebar.footer.action",
          id: "dsh-lango-entry",
          order: -10,
          locale: localeNamespace,
          inject: base
        }, LangoSidebarEntry)), ctx.slots.inject("plugins.row.config", () => ctx.slots.register({
          name: "plugins.row.config",
          key: "dsh-lango#dsh-lango",
          locale: localeNamespace,
          inject: base
        }, LangoConfigCard)), ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
          name: "plugins.bundle.config",
          key: "dsh-lango",
          locale: localeNamespace,
          inject: base
        }, LangoConfigCard));
      }
      return module.exports.apply = apply, module.exports.inject = ["connection", "slots", "locale"], module.exports;
    }
  });
})();
