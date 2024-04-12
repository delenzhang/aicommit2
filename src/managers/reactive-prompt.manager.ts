import chalk from 'chalk';
import inquirer from 'inquirer';
import ReactiveListPrompt, { ChoiceItem, ReactiveListChoice, ReactiveListLoader } from 'inquirer-reactive-list-prompt';
import { BehaviorSubject, ReplaySubject } from 'rxjs';

const defaultLoader = {
    isLoading: false,
    startOption: {
        text: 'AI is analyzing your changes',
    },
};

const emptyCommitMessage = `No commit messages were generated`;

export class ReactivePromptManager {
    private choices$: BehaviorSubject<ChoiceItem[]> = new BehaviorSubject<ChoiceItem[]>([]);
    private loader$: BehaviorSubject<ReactiveListLoader> = new BehaviorSubject<ReactiveListLoader>(defaultLoader);
    private destroyed$: ReplaySubject<boolean> = new ReplaySubject(1);

    constructor() {}

    initPrompt() {
        inquirer.registerPrompt('reactiveListPrompt', ReactiveListPrompt);
        return inquirer.prompt({
            type: 'reactiveListPrompt',
            name: 'aicommit2Prompt',
            message: 'Pick a commit message to use: ',
            emptyMessage: `⚠ ${emptyCommitMessage}`,
            choices$: this.choices$,
            loader$: this.loader$,
            loop: false,
        });
    }

    startLoader() {
        this.loader$.next({ isLoading: true });
    }

    refreshChoices(choice: ReactiveListChoice) {
        const { name, value, isError } = choice;
        if (!choice || !value) {
            return;
        }
        if (!choice.id) {
            // origin code
            const currentChoices = this.choices$.getValue();
            this.choices$.next([
                ...currentChoices,
                {
                    ...choice,
                    disabled: isError,
                },
            ]);
        }

        const currentChoices: ReactiveListChoice[] = this.choices$
            .getValue()
            .map(origin => origin as ReactiveListChoice);
        const isDone = choice.description === `done`;
        if (isDone) {
            const findOriginChoice = currentChoices.find(origin => {
                const originId = origin.id || '';
                const hasNumber = /\d/.test(originId);
                return choice.id?.includes(originId) && !hasNumber;
            });
            if (findOriginChoice) {
                this.choices$.next([...currentChoices.filter(origin => origin.id !== findOriginChoice.id), choice]);
                return;
            }
            this.choices$.next([...currentChoices, choice]);
            return;
        }

        const origin = currentChoices.find(origin => origin?.id === choice.id);
        if (origin) {
            this.choices$.next(currentChoices.map(origin => (origin?.id === choice.id ? choice : origin)));
            return;
        }
        this.choices$.next([...currentChoices, { ...choice }]);
    }

    checkErrorOnChoices() {
        const isAllError = this.choices$
            .getValue()
            .map(choice => choice as ReactiveListChoice)
            .every(value => value?.isError || value?.disabled);

        if (isAllError) {
            this.alertNoGeneratedMessage();
            this.logEmptyCommitMessage();
            process.exit(1);
            return;
        }
        this.stopLoaderOnSuccess();
    }

    completeSubject() {
        this.choices$.complete();
        this.loader$.complete();
        this.destroyed$.next(true);
        this.destroyed$.complete();
    }

    private alertNoGeneratedMessage() {
        this.loader$.next({
            isLoading: false,
            message: emptyCommitMessage,
            stopOption: {
                doneFrame: '⚠', // '✖'
                color: 'yellow', // 'red'
            },
        });
    }

    private stopLoaderOnSuccess() {
        this.loader$.next({ isLoading: false, message: 'Changes analyzed' });
    }

    private logEmptyCommitMessage() {
        console.log(`${chalk.bold.yellow('⚠')} ${chalk.yellow(`${emptyCommitMessage}`)}`);
    }
}
