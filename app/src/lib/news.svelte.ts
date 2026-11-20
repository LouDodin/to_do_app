// How many updates this device has not shown yet (a dot on the ? button), kept in step when the
// What's new box or the Updates tab marks them seen.
import { unseenNews, markNewsSeen } from './news';

class NewsState {
	unseen = $state(0);
	refresh() {
		this.unseen = typeof localStorage === 'undefined' ? 0 : unseenNews().length;
	}
	seen() {
		markNewsSeen();
		this.unseen = 0;
	}
}
export const news = new NewsState();
if (typeof window !== 'undefined') news.refresh();
