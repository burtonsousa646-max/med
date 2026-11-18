// Один атомарный скрипт для общего gate и обоих бюджетов; пользовательских исходников нет.
export const SLIDING_LOG = `
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local gate = redis.call('GET', KEYS[1])
if not gate then
  redis.call('SET', KEYS[1], ARGV[1] .. ':' .. tostring(now + 1000))
  return {-1, 1000}
end
local separator = string.find(gate, ':')
if not separator or string.sub(gate, 1, separator - 1) ~= ARGV[1] then return {-2, 0} end
local untilTime = tonumber(string.sub(gate, separator + 1))
if not untilTime then return {-2, 0} end
if now < untilTime then return {-1, untilTime - now} end
local retry = 0
local limit = tonumber(ARGV[2])
for i = 2, #KEYS do
  redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now - 1000)
  if redis.call('ZCARD', KEYS[i]) >= limit then
    local oldest = redis.call('ZRANGE', KEYS[i], 0, 0, 'WITHSCORES')
    retry = math.max(retry, 1000 - (now - tonumber(oldest[2])))
  end
end
if retry > 0 then return {0, retry} end
for i = 2, #KEYS do
  redis.call('ZADD', KEYS[i], now, ARGV[3])
  redis.call('PEXPIRE', KEYS[i], 1100)
end
return {1, 0}
`
