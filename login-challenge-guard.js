(() => {
  'use strict';

  const Z = window.Zorbas;
  if (!Z?.rpc || Z.__loginChallengeGuardInstalled) return;

  const rawRpc = Z.rpc.bind(Z);

  Z.rpc = async (name, payload = {}, options = {}) => {
    if (name !== 'zorbas_staff_login') {
      return rawRpc(name, payload, options);
    }

    const challenge = await rawRpc('zorbas_login_challenge', {
      p_username: payload.p_username,
      p_device_id: payload.p_device_id
    }, options);

    if (!challenge?.challenge) {
      throw new Error(challenge?.error || 'Неуспешна защитена сесия за вход. Опитайте отново.');
    }

    const result = await rawRpc('zorbas_staff_login_v2', {
      ...payload,
      p_challenge: challenge.challenge
    }, options);

    if (result?.error) {
      throw new Error(result.error);
    }

    return result;
  };

  Z.__loginChallengeGuardInstalled = true;
})();
