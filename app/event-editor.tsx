import { useLocalSearchParams } from 'expo-router';
import { EventForm } from '../src/features/calendar/EventForm';

export default function EventEditorModal() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  return <EventForm eventId={eventId} />;
}
