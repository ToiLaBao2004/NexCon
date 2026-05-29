import { useThemeStore } from "@/stores/useThemeStore";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Smile } from "lucide-react";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";

interface EmojiPickerProps {
    onChange: (value:string) => void;
}
const EmojiPicker = ({onChange} : EmojiPickerProps) => {
    const {isDark} = useThemeStore();

  return (
    <Popover>
        <PopoverTrigger className="cursor-pointer">
            <Smile className="size-4"/>
        </PopoverTrigger>

        <PopoverContent
            side="right"
            sideOffset={40}
            className="z-[260] mb-12 border-none bg-transparent p-0 shadow-none drop-shadow-none"
        >
            <Picker
                theme={isDark ? "dark" : "light"}
                data={data}
                onEmojiSelect={(emoji:any) => onChange(emoji.native)}
                emojiSize={24}
            />
        </PopoverContent>

    </Popover>
  );
};

export default EmojiPicker;
