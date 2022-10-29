import { Alert, Button } from "@mantine/core";
import Select, { ChangeHandlerArgs } from "lib-components/select";
import { Tab } from "lib-models/browser";
import { Progress } from "lib-models/progress";
import detectBrowser from "lib-utils/browser";
import {
  getAllItems,
  getCookies,
  isCookieType,
  setAllItems,
  StorageTypeList
} from "lib-utils/storage";
import { FormEvent, useEffect, useMemo, useState } from "react";
import alerts from "./alerts";
import CustomSelectOption from "./select-option";
import Wrapper, { Fieldset, Form, Heading } from "./style";
import { State } from "./type";
import CheckboxTree from 'react-checkbox-tree';

const browser = detectBrowser();

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [state, setState] = useState({} as State);
  const [progress, setProgress] = useState<
    Progress | { title: string; color: string; message: string }
  >(Progress.idle);

  useEffect(() => {
    browser.tabs.query({}, setTabs);
  }, []);

  useEffect(() => {
    browser.tabs.onReplaced.addListener(tabReplaceListener)

    return () => {
      browser.tabs.onReplaced.removeListener(tabReplaceListener)
    }
  }, [state, tabs])

  /**
   * when tab is discarded, the tab is replaced, so we must update the srcTab in State as well
   * otherwise all tab operations would throw error saying that tab doesn't exist 
   * 
   */
   const tabReplaceListener = (addedTabId: number, removedTabId: number) => {
     console.log("🚀 ~ file: app.tsx ~ line 48 ~ tabReplaceListener", "removedTabId", removedTabId, "addedTabId", addedTabId)

     // update the tabs list for select dropdown
     const indexOfReplacedTab = tabs.findIndex((oneTab) => oneTab.id == removedTabId)
     if (indexOfReplacedTab > -1) {
       browser.tabs.get(addedTabId, (addedTab) => {
         const newTabs = [...tabs]
         newTabs[indexOfReplacedTab] = addedTab
         setTabs(newTabs)
       })
     }

     // update the srcTab to reflect current value
     const { srcTab } = state
     if (srcTab?.id == removedTabId) {
       browser.tabs.get(addedTabId, (addedTab) => {
         setState({
           ...state,
           srcTab: addedTab
         })
       })
     }
   }
  async function handleChange({ name, value }: ChangeHandlerArgs<Tab>) {
    console.log("🚀 ~ file: app.tsx ~ line 32 ~ handleChange ~ { name, value }", { name, value })

    Promise.resolve(updateCheckboxTree(name, value));
    setState((s) => {
      return { ...s, [name]: value };
    });

  }

  function resetSubmission() {
    setTimeout(() => {
      setProgress(Progress.idle);
    }, 1500);
  }

  async function handleShare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProgress(Progress.started);

    const { srcStorage, srcTab, destStorage, destTab } = state;

    try {
      if (srcStorage === destStorage && srcTab.id === destTab.id) {
        setProgress(Progress.stopped);
      } else {
        const isSrcCookie = isCookieType(srcStorage);
        const isDestCookie = isCookieType(destStorage);
        if (isSrcCookie || isDestCookie) {
          if (isSrcCookie && isDestCookie) {
            const srcCookies = await getCookies(srcTab);
            for (const cookie of srcCookies) {
              let domain = new URL(destTab.url).hostname;
              if (cookie.domain.startsWith(".")) {
                domain = `.${domain}`;
              }
              try {
                await browser.cookies.set({
                  domain,
                  url: destTab.url,
                  path: cookie.path,
                  name: cookie.name,
                  value: String(cookie.value || ""),
                  secure: cookie.secure,
                  httpOnly: cookie.httpOnly,
                  sameSite: cookie.sameSite,
                  expirationDate: cookie.expirationDate,
                });
              } catch (error) {
                console.error(error);
              }
            }
            setProgress(Progress.pass);
          } else {
            setProgress({
              color: "red",
              title: "🛑 Mismatch",
              message: 'Source and destination storage should be "cookie"',
            });
          }
        } else {
          const [getAll] = await browser.scripting.executeScript({
            target: { tabId: srcTab.id },
            args: [srcStorage],
            func: getAllItems,
          });
          if (getAll?.result) {
            await browser.scripting.executeScript({
              target: { tabId: destTab.id },
              args: [destStorage, getAll.result],
              func: setAllItems,
            });
            setProgress(Progress.pass);
          } else {
            setProgress(Progress.stopped);
          }
        }
      }
    } catch (error) {
      console.error("submit", error);
      setProgress(Progress.fail);
    }
    resetSubmission();
  }

  const hasAllValues = Object.values(state).filter(Boolean).length === 4;
  const disabledField = progress !== Progress.idle;

  const PresetAlert = useMemo<JSX.Element>(() => {
    return typeof progress === "number" ? (
      alerts[progress]
    ) : (
      <Alert color={progress.color} title={progress.title}>
        {progress.message}
      </Alert>
    );
  }, [progress]);

  const updateCheckboxTree = async (name , value) => {
    const {srcTab, srcStorage } = {
      ...state,
      [name]: value
    } as State
    if(srcTab?.id && srcStorage){
      // TODO: make storage/cookie data suitable for checkbox-tree
      if(isCookieType(srcStorage)){
        const srcCookies = await getCookies(srcTab);
        console.log("🚀 ~ file: app.tsx ~ line 141 ~ updateCheckboxTree ~ srcCookies", srcCookies)
      }else{
        /**
         * if tab is discarded/unloaded from memory, executescript fails
         * so we reload the tab first and then fetch storage
         */
        const isTabUnloaded = srcTab.status === 'unloaded' // type TabStatus exists in chrome docs but not in TS types https://developer.chrome.com/docs/extensions/reference/tabs/#type-TabStatus
        isTabUnloaded && await browser.tabs.reload(srcTab.id)
        const [getAll] = await browser.scripting.executeScript({
          target: { tabId: srcTab.id },
          args: [srcStorage],
          func: getAllItems,
        });
        /**
         * So we discard the tab again as it was discarded earlier and don't want to consume user's memory
         * BUT BUT BUT due to discarding the tab, tab is replaced, and the tab we have in srcTab is not the same
         * so we use browser.tabs.onReplaced, check on top
         * this discard also returns the new tab, but onReplace handles more cases like tab getting discarded automatically
         * so we use that
         */
        isTabUnloaded && await browser.tabs.discard(srcTab.id) 
        console.log("🚀 ~ file: app.tsx ~ line 139 ~ updateCheckboxTree ~ getAll", getAll.result)
      }
      // setState({
      //   ...state,
      //   selectedVals: {
      //     ...(state.selectedVals),
      //     nodes: []
      //   }
      // })
    }
  }

  return (
    <Wrapper>
      <Heading>StorageX</Heading>

      <Form onSubmit={handleShare}>
        <Fieldset>
          <legend>Source</legend>

          <Select
            label="Tab"
            name="srcTab"
            options={tabs}
            valueAsObject
            value={state.srcTab}
            onChange={handleChange}
            disabled={disabledField}
            itemComponent={CustomSelectOption}
            fieldKey={{
              value: "id",
              label: "title",
            }}
          />

          <Select
            label="Storage"
            name="srcStorage"
            options={StorageTypeList}
            value={state.srcStorage}
            disabled={disabledField}
            onChange={handleChange}
          />
{/* 
            <CheckboxTree 
                          nodes={}
                          checked={}
                          expanded={}
                          onCheck={}
                          onExpand={}
                           /> */}
            
        </Fieldset>

        <Fieldset>
          <legend>Destination</legend>

          <Select
            label="Tab"
            name="destTab"
            options={tabs}
            valueAsObject
            value={state.destTab}
            onChange={handleChange}
            disabled={disabledField}
            itemComponent={CustomSelectOption}
            fieldKey={{
              value: "id",
              label: "title",
            }}
          />

          <Select
            label="Storage"
            name="destStorage"
            options={StorageTypeList}
            value={state.destStorage}
            disabled={disabledField}
            onChange={handleChange}
          />
        </Fieldset>

        {progress === Progress.idle ? (
          <Button type="submit" disabled={!hasAllValues}>
            Share Tab Storage
          </Button>
        ) : (
          PresetAlert
        )}
      </Form>
    </Wrapper>
  );
}


