import '@testing-library/jest-dom';
import { vi, afterEach } from 'vitest';

// Mock Google Maps API
const mockGoogle = {
  maps: {
    LatLng: class {
      lat: number;
      lng: number;
      constructor(lat: number, lng: number) {
        this.lat = lat;
        this.lng = lng;
      }
    },
    LatLngBounds: class {
      extend = vi.fn();
    },
    TravelMode: {
      WALKING: 'WALKING',
      DRIVING: 'DRIVING',
    },
    DistanceMatrixService: class {
      getDistanceMatrix = vi.fn();
    },
    places: {
      Place: class {
        constructor(_options: { id: string }) {}
        fetchFields = vi.fn();
        static searchByText = vi.fn();
      },
    },
    importLibrary: vi.fn(),
    event: {
      removeListener: vi.fn(),
    },
  },
};

// Set up global mocks
vi.stubGlobal('google', mockGoogle);

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
vi.stubGlobal('sessionStorage', sessionStorageMock);

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
vi.stubGlobal('localStorage', localStorageMock);

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});

