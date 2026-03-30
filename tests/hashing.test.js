const { hashAnimal, hashEnvironment } = require('../packages/privacy/hashing');

describe('hashAnimal', () => {
    test('should generate consistent hash for same inputs', () => {
        const hash1 = hashAnimal('985112345678901', '2026-03-25', 'secret123');
        const hash2 = hashAnimal('985112345678901', '2026-03-25', 'secret123');

        expect(hash1).toBe(hash2);
    });

    test('should generate different hash for different microchip', () => {
        const hash1 = hashAnimal('985112345678901', '2026-03-25', 'secret123');
        const hash2 = hashAnimal('985119999999999', '2026-03-25', 'secret123');

        expect(hash1).not.toBe(hash2);
    });

    test('should generate different hash for different date', () => {
        const hash1 = hashAnimal('985112345678901', '2026-03-25', 'secret123');
        const hash2 = hashAnimal('985112345678901', '2026-03-26', 'secret123');

        expect(hash1).not.toBe(hash2);
    });

    test('should generate different hash for different salt', () => {
        const hash1 = hashAnimal('985112345678901', '2026-03-25', 'secret123');
        const hash2 = hashAnimal('985112345678901', '2026-03-25', 'secret456');

        expect(hash1).not.toBe(hash2);
    });

    test('hash should be 64 characters long (SHA-256)', () => {
        const hash = hashAnimal('985112345678901', '2026-03-25', 'secret123');

        expect(hash.length).toBe(64);
    });

    test('hash should be hexadecimal', () => {
        const hash = hashAnimal('985112345678901', '2026-03-25', 'secret123');

        expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });

    test('should throw error if microchipId is missing', () => {
        expect(() => {
            hashAnimal('', '2026-03-25', 'secret123');
        }).toThrow('All parameters are required');
    });

    test('should throw error if intakeDate is missing', () => {
        expect(() => {
            hashAnimal('985112345678901', '', 'secret123');
        }).toThrow('All parameters are required');
    });

    test('should throw error if salt is missing', () => {
        expect(() => {
            hashAnimal('985112345678901', '2026-03-25', '');
        }).toThrow('All parameters are required');
    });
});

describe('hashEnvironment', () => {
    test('should generate consistent hash for same inputs', () => {
        const hash1 = hashEnvironment('Refugio Patitas', 2026, 'secret123');
        const hash2 = hashEnvironment('Refugio Patitas', 2026, 'secret123');

        expect(hash1).toBe(hash2);
    });

    test('should normalize name (case insensitive)', () => {
        const hash1 = hashEnvironment('Refugio Patitas', 2026, 'secret123');
        const hash2 = hashEnvironment('REFUGIO PATITAS', 2026, 'secret123');
        const hash3 = hashEnvironment('refugio patitas', 2026, 'secret123');

        expect(hash1).toBe(hash2);
        expect(hash2).toBe(hash3);
    });

    test('should trim whitespace from name', () => {
        const hash1 = hashEnvironment('Refugio Patitas', 2026, 'secret123');
        const hash2 = hashEnvironment('  Refugio Patitas  ', 2026, 'secret123');

        expect(hash1).toBe(hash2);
    });

    test('should generate different hash for different name', () => {
        const hash1 = hashEnvironment('Refugio Patitas', 2026, 'secret123');
        const hash2 = hashEnvironment('Refugio Amigos', 2026, 'secret123');

        expect(hash1).not.toBe(hash2);
    });

    test('should generate different hash for different year', () => {
        const hash1 = hashEnvironment('Refugio Patitas', 2026, 'secret123');
        const hash2 = hashEnvironment('Refugio Patitas', 2027, 'secret123');

        expect(hash1).not.toBe(hash2);
    });

    test('should generate different hash for different salt', () => {
        const hash1 = hashEnvironment('Refugio Patitas', 2026, 'secret123');
        const hash2 = hashEnvironment('Refugio Patitas', 2026, 'secret456');

        expect(hash1).not.toBe(hash2);
    });

    test('hash should be 64 characters long', () => {
        const hash = hashEnvironment('Refugio Patitas', 2026, 'secret123');

        expect(hash.length).toBe(64);
    });

    test('hash should be hexadecimal', () => {
        const hash = hashEnvironment('Refugio Patitas', 2026, 'secret123');

        expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });

    test('should throw error if name is missing', () => {
        expect(() => {
            hashEnvironment('', 2026, 'secret123');
        }).toThrow('All parameters are required');
    });

    test('should throw error if year is missing', () => {
        expect(() => {
            hashEnvironment('Refugio Patitas', null, 'secret123');
        }).toThrow('All parameters are required');
    });

    test('should throw error if salt is missing', () => {
        expect(() => {
            hashEnvironment('Refugio Patitas', 2026, '');
        }).toThrow('All parameters are required');
    });
});
