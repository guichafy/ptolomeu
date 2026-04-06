#import <AppKit/AppKit.h>
#include <signal.h>

// Delegate that hides the window instead of closing it
@interface OverlayWindowDelegate : NSObject <NSWindowDelegate>
@property (nonatomic, weak) id originalDelegate;
@end

@implementation OverlayWindowDelegate

- (BOOL)windowShouldClose:(NSWindow *)sender {
    // Hide the window instead of closing
    [sender orderOut:nil];
    return NO;
}

// Forward any other delegate methods to the original delegate
- (BOOL)respondsToSelector:(SEL)aSelector {
    if (aSelector == @selector(windowShouldClose:)) return YES;
    if (self.originalDelegate && [self.originalDelegate respondsToSelector:aSelector]) return YES;
    return [super respondsToSelector:aSelector];
}

- (id)forwardingTargetForSelector:(SEL)aSelector {
    if (self.originalDelegate && [self.originalDelegate respondsToSelector:aSelector]) {
        return self.originalDelegate;
    }
    return [super forwardingTargetForSelector:aSelector];
}

@end

static OverlayWindowDelegate *overlayDelegate = nil;

void makeWindowOverlay(void *nsWindowPtr) {
    if (!nsWindowPtr) return;
    NSWindow *window = (__bridge NSWindow *)nsWindowPtr;
    dispatch_async(dispatch_get_main_queue(), ^{
        // Install or re-install delegate to intercept close
        if (window.delegate != overlayDelegate) {
            if (!overlayDelegate) {
                overlayDelegate = [[OverlayWindowDelegate alloc] init];
            }
            overlayDelegate.originalDelegate = window.delegate;
            window.delegate = overlayDelegate;
        }

        [window setOpaque:NO];
        [window setBackgroundColor:[[NSColor blackColor] colorWithAlphaComponent:0.85]];
        [window setCollectionBehavior:
            NSWindowCollectionBehaviorMoveToActiveSpace |
            NSWindowCollectionBehaviorFullScreenAuxiliary];
        [window setLevel:NSStatusWindowLevel];

        // Center window on the current screen
        NSScreen *screen = [NSScreen mainScreen];
        if (screen) {
            NSRect screenFrame = [screen visibleFrame];
            NSRect windowFrame = [window frame];
            CGFloat x = NSMidX(screenFrame) - windowFrame.size.width / 2;
            CGFloat y = NSMidY(screenFrame) - windowFrame.size.height / 2;
            [window setFrameOrigin:NSMakePoint(x, y)];
        }

        [window orderFrontRegardless];
        [NSApp activateIgnoringOtherApps:YES];
    });
}


void quitApp(void) {
    // Kill the entire process group (app + watcher + parent scripts)
    kill(0, SIGTERM);
    _exit(0);
}
