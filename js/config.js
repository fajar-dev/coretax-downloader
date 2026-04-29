const CONFIG = Object.freeze({
  BASE_API:        'https://transit.is5x.nusa.net.id/coretax-sync',
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
