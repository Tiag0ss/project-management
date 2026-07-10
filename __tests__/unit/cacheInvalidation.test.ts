import { delKeyFamily } from '../../server/services/cacheInvalidation';
import { cache } from '../../server/services/cache';

jest.mock('../../server/services/cache', () => ({
  cache: {
    del: jest.fn().mockResolvedValue(undefined),
    delByPrefix: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockedDel = cache.del as jest.Mock;
const mockedDelByPrefix = cache.delByPrefix as jest.Mock;

describe('Cache invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delKeyFamily deletes exact key and prefixed variants', async () => {
    await delKeyFamily('project:42:tasks');

    expect(mockedDel).toHaveBeenCalledWith('project:42:tasks');
    expect(mockedDelByPrefix).toHaveBeenCalledWith('project:42:tasks:');
  });
});
