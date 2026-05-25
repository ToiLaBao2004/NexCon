import { useState, useMemo, useEffect } from 'react';
import { useChatStore } from '@/stores/useChatStore';
import { useFriendStore } from '@/stores/useFriendStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Search, UserPlus2, Check } from 'lucide-react';
import { removeAccents } from '@/lib/utils';
import EmojiPicker from './EmojiPicker';
import { FIELD_LIMITS, checkFieldFormat } from '@/lib/fieldFormat';

interface NewGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSelected?: string[];
}

const MAX_GROUP_MEMBERS = 100;
const MAX_SELECTED_FRIENDS = MAX_GROUP_MEMBERS - 1;

const NewGroupModal = ({ isOpen, onClose, initialSelected }: NewGroupModalProps) => {
  const [groupName, setGroupName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const { friends } = useFriendStore();
  const { createGroup } = useChatStore();

  const filteredFriends = useMemo(() => {
    if (!searchTerm) return friends;
    const searchRaw = searchTerm.toLowerCase();
    const searchNormalized = removeAccents(searchRaw);

    return friends.filter(friend => {
      const name = friend.displayName.toLowerCase();
      const nickname = (friend.nickname || "").toLowerCase();
      const nameN = removeAccents(name);
      const nicknameN = removeAccents(nickname);

      return name.includes(searchRaw) ||
        nickname.includes(searchRaw) ||
        nameN.includes(searchNormalized) ||
        nicknameN.includes(searchNormalized);
    });
  }, [friends, searchTerm]);

  // Handle friend selection

  const toggleFriendSelection = (friendId: string) => {
    if (!selectedFriends.includes(friendId) && selectedFriends.length >= MAX_SELECTED_FRIENDS) {
      toast.error(`Nhóm chỉ có thể chứa tối đa ${MAX_GROUP_MEMBERS} thành viên.`);
      return;
    }

    setSelectedFriends(prev =>
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  // when opened with initial selected members, preload them
  useEffect(() => {
    if (isOpen) {
      setSelectedFriends((initialSelected ?? []).slice(0, MAX_SELECTED_FRIENDS));
    }
  }, [isOpen, initialSelected]);

  const handleCreateGroup = async () => {
    const normalizedGroupName = groupName.trim();
    const groupNameError = checkFieldFormat('groupName', normalizedGroupName);
    if (groupNameError) {
      toast.error(groupNameError);
      return;
    }

    if (selectedFriends.length === 0) {
      toast.error('Vui lòng chọn ít nhất một người bạn');
      return;
    }

    if (selectedFriends.length > MAX_SELECTED_FRIENDS) {
      toast.error(`Nhóm chỉ có thể chứa tối đa ${MAX_GROUP_MEMBERS} thành viên.`);
      return;
    }

    try {
      setCreating(true);
      await createGroup(normalizedGroupName, selectedFriends);
      toast.success('Đã tạo nhóm thành công!');
      onClose();
      // Reset state
      setGroupName('');
      setSelectedFriends([]);
      setSearchTerm('');
    } catch (error) {
      toast.error('Tạo nhóm thất bại. Vui lòng thử lại.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold text-foreground text-center">
            Tạo nhóm
          </DialogTitle>
          <DialogDescription className="text-center">
            Nhập tên nhóm và chọn thành viên để bắt đầu cuộc trò chuyện nhóm.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <label htmlFor="groupName" className="text-sm font-medium">
              Tên nhóm
            </label>
            <div className="relative">
              <Input
                id="groupName"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={FIELD_LIMITS.groupName}
                className="pr-10 border-border focus:ring-primary/50"
                placeholder="Nhập tên nhóm..."
              />
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="size-8 hover:bg-gray-100 transition-smooth"
                >
                  <div>
                    <EmojiPicker onChange={(emoji: string) => setGroupName(`${groupName}${emoji}`.slice(0, FIELD_LIMITS.groupName))} />
                  </div>
                </Button>
              </div>
            </div>
            <div
              className={`text-right text-xs ${
                groupName.length >= FIELD_LIMITS.groupName ? 'text-destructive' : 'text-muted-foreground'
              }`}
            >
              {groupName.length}/{FIELD_LIMITS.groupName}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Chọn thành viên ({selectedFriends.length})
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm bạn bè..."
                className="pl-9 bg-secondary/30 border-border"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="max-h-[200px] overflow-y-auto beautiful-scrollbar pr-1 space-y-1 mt-2">
              {filteredFriends.length > 0 ? (
                filteredFriends.map((friend: any) => (
                  <div
                    key={friend.friendId}
                    onClick={() => toggleFriendSelection(friend.friendId)}
                    className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all ${selectedFriends.includes(friend.friendId)
                      ? 'bg-primary/10 border border-primary/20'
                      : 'hover:bg-secondary/50'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                        <AvatarImage src={friend.avatarUrl} alt={friend.displayName} />
                        <AvatarFallback className="bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700">
                          {friend.displayName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {friend.nickname?.trim() || friend.displayName}
                        </p>
                        {friend.nickname && (
                          <p className="text-xs text-muted-foreground">{friend.displayName}</p>
                        )}
                      </div>
                    </div>
                    {selectedFriends.includes(friend.friendId) ? (
                      <div className="bg-blue-600 rounded-full p-1">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    ) : (
                      <UserPlus2 className="h-4 w-4 text-muted-foreground/50" />
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">Không tìm thấy bạn bè nào.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            Hủy
          </Button>
          <Button
            onClick={handleCreateGroup}
            disabled={creating || !groupName.trim() || selectedFriends.length === 0 || selectedFriends.length > MAX_SELECTED_FRIENDS}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md transition-all active:scale-95"
          >
            {creating ? 'Đang tạo...' : 'Tạo nhóm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewGroupModal;
