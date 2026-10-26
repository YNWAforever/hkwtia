import {expect,it,vi} from 'vitest';
import {isTransientConnectError,retryConnect,connectTimingPool} from '@/scripts/acceptance/db-timing';
it('recognizes transport failures but refuses SQL and assertion errors',()=>{
  for(const error of [Error('Received network error or non-101 status code.'),{code:'ECONNRESET'},{code:'ETIMEDOUT'},Error('Connection timeout')]) expect(isTransientConnectError(error)).toBe(true);
  for(const error of [Error('assertion failed'),{code:'23505',message:'connection timeout'}, {name:'AssertionError',message:'connection timeout'},Error('syntax error')]) expect(isTransientConnectError(error)).toBe(false);
});
it('bounds attempts and backoff, reports recovered and exhausted attempts',async()=>{
  const sleep=vi.fn(async()=>{}), stats={attempts:0,failedHandshakes:0,retriedSuccesses:0,exhausted:0};
  const connect=vi.fn().mockRejectedValueOnce(Error('Connection timeout')).mockResolvedValueOnce(42);
  expect(await retryConnect(connect,stats,sleep)).toBe(42);
  expect(stats).toEqual({attempts:2,failedHandshakes:1,retriedSuccesses:1,exhausted:0});
  await expect(retryConnect(async()=>{throw {code:'ECONNRESET'};},stats,sleep)).rejects.toEqual({code:'ECONNRESET'});
  expect(sleep.mock.calls).toEqual([[100],[100],[200]]);
  expect(stats).toEqual({attempts:5,failedHandshakes:4,retriedSuccesses:1,exhausted:1});
});
it('never retries SQL errors or assertions',async()=>{
  const operation=vi.fn(async()=>{throw {code:'42601',message:'connection timeout'};});
  await expect(retryConnect(operation)).rejects.toMatchObject({code:'42601'});
  expect(operation).toHaveBeenCalledTimes(1);
});

it('ends failed pools before acquiring a fresh one and leaves the successful pool to its caller',async()=>{
  const released=vi.fn(),end=vi.fn(async()=>{}),successEnd=vi.fn(async()=>{});
  const failed={connect:async()=>{throw Error('Connection timeout');},end};
  const good={connect:async()=>({release:released}),end:successEnd};
  const factory=vi.fn().mockReturnValueOnce(failed).mockImplementation(()=>{
    expect(end).toHaveBeenCalledTimes(1);
    return good;
  });
  expect((await connectTimingPool(factory)).pool).toBe(good);
  expect(released).toHaveBeenCalledTimes(1);
  expect(successEnd).not.toHaveBeenCalled();
});
