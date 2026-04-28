const CONFIG = Object.freeze({
  BASE_API:        'http://localhost:4000/api',
  CORETAX_API:      'https://coretaxdjp.pajak.go.id/documentmanagementportal/api',
  CORETAX_HOST:     'pajak.go.id',
  STORAGE_KEY_USER: 'userInfo',
  SYNC_DELAY_MS:    800,
});

const STATE = Object.freeze({
  IDLE:     'IDLE',
  VERIFIED: 'VERIFIED',
  SYNCING:  'SYNCING',
  FINISH:   'FINISH',
});
