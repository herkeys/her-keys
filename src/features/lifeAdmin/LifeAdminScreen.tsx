import { View } from 'react-native';
import { useAccount } from '../../store/AccountProvider';
import { useAppStore, useHouseholdState, useStoreSnapshot } from '../../store/AppStateProvider';
import { PersistenceNotice } from '../today/PersistenceNotice';
import { SyncNotice } from '../today/SyncNotice';
import { LifeAdminContainer, type LifeAdminNavigation } from './LifeAdminContainer';

/** The connected screen: reads the store and the account, and hands them to the container. */
export function LifeAdminScreen(navigation: LifeAdminNavigation) {
  const { state, today } = useHouseholdState();
  const snapshot = useStoreSnapshot();
  const { syncNamespace } = useAccount();
  const store = useAppStore();
  return (
    <View>
      <PersistenceNotice />
      <SyncNotice />
      <LifeAdminContainer
        state={state}
        today={today}
        gateInput={{ storeStatus: snapshot.status, persistence: snapshot.persistence, syncHydration: syncNamespace?.hydration ?? null }}
        store={store}
        {...navigation}
      />
    </View>
  );
}
